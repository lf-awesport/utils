const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const rng = require("seedrandom")
const { firestore } = require("./firebase") // ⚠️ Usa Firestore SDK Cloud

const userAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"

async function getExistingIds() {
  const snapshot = await firestore.collection("posts").get()
  const ids = new Set()
  snapshot.forEach((doc) => ids.add(doc.id))
  console.log(`🔍 Found ${ids.size} articles in db`)
  return ids
}

function createPromiseProducer(browser, urls, scrapeArticle) {
  return () => {
    const url = urls.pop()
    return url ? scrapeArticle(browser, url) : null
  }
}

async function scrapeDirettaUrls(browser, dbIds, urls) {
  const categories = [
    "calcio",
    "serie-a",
    "tennis",
    "motori",
    "basket",
    "sport-invernali",
    "rugby",
    "ciclismo",
    "sport-usa",
    "boxe",
    "atletica",
    "nuoto",
    "golf",
    "pallavolo",
    "padel",
    "altri-sport",
    "terzo-tempo",
    "interviste-esclusive"
  ]

  for (const category of categories) {
    const page = await browser.newPage()
    await page.setUserAgent(userAgent)

    const url = `https://www.diretta.it/news/${category}/page-10/`
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })

    const newUrls = await page.$$eval("a", (elements) =>
      elements
        .map((el) => el.href)
        .filter(
          (el) =>
            el.includes("https://www.diretta.it/news/") &&
            !el.includes("tracker")
        )
    )

    for (const u of newUrls) {
      if (!dbIds.has(u)) {
        urls.push(u)
      }
    }

    await page.close()
  }

  console.log("✅ DIR")
}

async function scrapeCF(browser, dbIds, urls) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)
  await page.goto("https://www.calcioefinanza.it/", {
    waitUntil: "networkidle2",
    timeout: 60000
  })
  const urlsCF = await page.$$eval("article>a", (els) => els.map((e) => e.href))
  const titlesCF = await page.$$eval(".post-title", (els) =>
    els.map((e) => e.innerText)
  )

  await page.goto("https://www.sportefinanza.it/", {
    waitUntil: "networkidle2",
    timeout: 60000
  })
  const urlsSF = await page.$$eval("article>a", (els) => els.map((e) => e.href))
  const titlesSF = await page.$$eval(".post-title", (els) =>
    els.map((e) => e.innerText)
  )
  await page.close()

  const allUrls = urlsCF.concat(urlsSF)
  const allTitles = titlesCF.concat(titlesSF)
  const ids = allTitles.map((t) => rng(t)().toString())

  for (let i = 0; i < ids.length; i++) {
    if (!dbIds.has(ids[i])) urls.push(allUrls[i])
  }
  console.log(`✅ CF & SF`)
}

async function scrapeRU(browser, dbIds, urls) {
  const categories = [
    "media",
    "lifestyle",
    "altri-sport",
    "calcio-internazionale",
    "serie-a"
  ]
  for (const category of categories) {
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const page = await browser.newPage()
      await page.setUserAgent(userAgent)
      await page.goto(
        `https://www.rivistaundici.com/category/${category}/page/${pageNum}`,
        {
          waitUntil: "networkidle2",
          timeout: 60000
        }
      )
      const currentUrls = await page.$$eval(".article-title", (els) =>
        els.map((el) => el.href)
      )
      const currentTitles = await page.$$eval(".article-title > span", (els) =>
        els.map((el) => el.innerText)
      )
      await page.close()

      const ids = currentTitles.map((t) => rng(t)().toString())
      for (let i = 0; i < ids.length; i++) {
        if (!dbIds.has(ids[i])) urls.push(currentUrls[i])
      }
    }
  }
  console.log(`✅ RU`)
}

async function scrapeDS(browser, dbIds, urls) {
  for (let currentPage = 1; currentPage <= 6; currentPage++) {
    const page = await browser.newPage()
    await page.setUserAgent(userAgent)
    await page.goto(
      `https://www.italiaoggi.it/settori/sport?page=${currentPage}`,
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    )

    const currentUrls = await page.$$eval("h5>a", (elements) =>
      elements.map((element) => element.href)
    )
    const currentTitles = await page.$$eval("h5>a", (elements) =>
      elements.map((element) => element.innerText)
    )

    const currentIds = currentTitles.map((e) => rng(e)().toString())

    for (let i = 0; i < currentIds.length; i++) {
      if (!dbIds.has(currentIds[i])) urls.push(currentUrls[i])
    }

    await page.close()
  }
  console.log(`✅ DS`)
}

async function scrapeArticleCF(browser, url) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })
    const title = await page.$eval(".a-title>h1", (el) => el.innerText)
    const date = await page.$eval(".a-date>time", (el) => el.dateTime)
    const author = "Sport & Finanza"
    const imgLink = await page.$eval(".thumb-img", (el) => el.src)
    const excerpt = await page.$eval(".a-excerpt p", (el) => el.innerText)
    const body = await page.$$eval(".txt-block>p", (els) =>
      els.map((e) => e.innerText).join("/n")
    )
    const id = rng(title)().toString()

    if (body.includes("FPeX") || body.includes("Exchange")) return

    await firestore
      .collection("posts")
      .doc(id)
      .set(
        {
          title,
          excerpt,
          body,
          date: date.split("T")[0],
          url,
          id,
          author,
          imgLink
        },
        { merge: true }
      )

    console.log(`✅ CF: ${url}`)
  } catch (e) {
    console.error(`❌ CF: ${url}`)
  } finally {
    await page.close()
  }
}

async function scrapeArticleRU(browser, url) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })
    const title = await page.$eval(".article-title", (el) => el.innerText)
    const dateText = await page.$eval(".article-datetime", (el) => el.innerText)
    const author = "Rivista Undici"
    const imgLink = await page.$eval(".wp-post-image", (el) => el.src)
    const excerpt = await page.$eval(".article-summary", (el) => el.innerText)
    const body = await page.$$eval(".article-content > p", (els) =>
      els.map((e) => e.innerText).join("/n")
    )
    const id = rng(title)().toString()

    const date = new Date(dateText).toISOString().split("T")[0]

    await firestore.collection("posts").doc(id).set(
      {
        title,
        excerpt,
        body,
        date,
        url,
        id,
        author,
        imgLink
      },
      { merge: true }
    )

    console.log(`✅ RU: ${url}`)
  } catch (e) {
    console.error(`❌ RU: ${url}`)
  } finally {
    await page.close()
  }
}

async function scrapeArticleDS(browser, url) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })

    const imgLink = await page.$eval("figure > img", (element) => element.src)
    const title = await page.$eval("h1", (el) => el.innerText)
    const date = await page.$eval("time", (el) => {
      const dateArray = el.outerText.split("DEL").pop().split(" ")[0].split("/")

      return JSON.stringify(
        new Date(
          parseInt(dateArray[2]),
          parseInt(dateArray[1]) - 1,
          parseInt(dateArray[0]) + 1
        )
      ).replace(/['"]+/g, "")
    })

    const excerpt = await page.$eval("h2", (el) => el.innerText)
    const body = await page.$$eval("#articolo  p", (els) =>
      els.map((e) => e.innerText).join("/n")
    )
    const id = rng(title)().toString()

    await firestore
      .collection("posts")
      .doc(id)
      .set(
        {
          title,
          excerpt,
          body,
          date: date.split("T")[0],
          url,
          id,
          author: "Diritto & Sport",
          imgLink
        },
        { merge: true }
      )

    console.log(`✅ DS: ${url}`)
  } catch (e) {
    console.error(`❌ DS: ${url}`)
  } finally {
    await page.close()
  }
}

async function scrapeDirettaArticle(browser, url) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })

    const title = await page.$eval("h1", (el) => el.innerText)
    const fullDate = await page.$eval(
      ".wcl-news-caption-01_gHM5e + meta",
      (el) => el.content
    )
    const date = fullDate.split("T")[0] // Risultato: "2025-04-18"

    const imgLink = await page
      .$eval(".wcl-image_MVcAW", (el) => el.src)
      .catch(() => null)

    const excerpt = await page
      .$eval("div.fsNewsArticle__perex", (el) => el.innerText)
      .catch(() => "")

    const body = await page.$$eval("div.fsNewsArticle__content p", (els) =>
      els.map((el) => el.innerText).join("\n")
    )

    const id = rng(title)().toString()
    const author = "Diretta"
    console.log({
      title,
      excerpt,
      body,
      date,
      url,
      id,
      author,
      imgLink
    })
    await firestore.collection("posts").doc(id).set(
      {
        title,
        excerpt,
        body,
        date,
        url,
        id,
        author,
        imgLink
      },
      { merge: true }
    )

    console.log(`✅ DIR: ${url}`)
  } catch (e) {
    console.error(`❌ DIR: ${url}`)
  } finally {
    await page.close()
  }
}

async function runAllScrapers() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  const dbIds = await getExistingIds()
  const urls = []

  await scrapeDirettaUrls(browser, dbIds, urls)
  await scrapeCF(browser, dbIds, urls)
  await scrapeRU(browser, dbIds, urls)
  await scrapeDS(browser, dbIds, urls)

  console.log(`🔍 Found ${urls.length} new articles to scrape`)

  const pool = new Pool(
    createPromiseProducer(browser, urls, async (b, url) => {
      if (url.includes("diretta.it")) {
        return scrapeDirettaArticle(b, url)
      }
      if (url.includes("calcioefinanza") || url.includes("sportefinanza")) {
        return scrapeArticleCF(b, url)
      } else if (url.includes("rivistaundici")) {
        return scrapeArticleRU(b, url)
      } else if (url.includes("italiaoggi")) {
        return scrapeArticleDS(b, url)
      }
    }),
    3
  )

  await pool.start()
  await browser.close()
  console.log("✅ Finished scraping all articles")
}

module.exports = { runAllScrapers }
