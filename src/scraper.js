const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const rng = require("seedrandom")
const { firestore } = require("./firebase") // ⚠️ Usa Firestore SDK Cloud

const userAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"

function createPromiseProducer(browser, urls, scrapeArticle) {
  return () => {
    const url = urls.pop()
    return url ? scrapeArticle(browser, url) : null
  }
}

function extractDateFromSBMUrl(url) {
  const match = url.match(/\/([0-9]{4})\/([0-9]{2})\/([0-9]{2})\//)
  if (!match) return null
  const [_, year, month, day] = match
  return `${year}-${month}-${day}`
}

async function scrapeSBM(browser, urls, mode = "current") {
  const startYear = mode === "all" ? 2016 : 2025
  const endYear = mode === "all" ? 2025 : 2025
  const isValidArticleUrl = (url) =>
    /\/20[2-5][0-9]\/[01][0-9]\/[0-3][0-9]\//.test(url)

  for (let year = startYear; year <= endYear; year++) {
    for (let pageNum = 1; pageNum <= 85; pageNum++) {
      const page = await browser.newPage()
      await page.setUserAgent(userAgent)

      const url = `https://sportbusinessmag.sport-press.it/${year}/page/${pageNum}/`
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 })

        const links = await page.$$eval("figure a", (els) => [
          ...new Set(els.map((el) => el.href))
        ])

        if (links.length === 0) break // 🔴 Stop se pagina vuota

        const titles = await page.$$eval(".post-content h2.title", (els) =>
          els.map((el) => el.innerText)
        )
        for (let i = 0; i < titles.length; i++) {
          const id = rng(titles[i])().toString()
          const postRef = firestore.collection("posts").doc(id)
          const postSnap = await postRef.get()

          if (!postSnap.exists && links[i] && isValidArticleUrl(links[i])) {
            urls.push(links[i])
          }
        }
      } catch (e) {
        console.error(`⚠️ SBM Archive error: ${url}`)
      } finally {
        await page.close()
      }
    }
  }

  console.log(`✅ SBM, queue:${urls.length}`)
}

async function scrapeArticleSBM(browser, url) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 })

    const title = await page.$eval("h1.title", (el) => el.innerText)
    const date = extractDateFromSBMUrl(url)
    const imgLink = await page
      .$eval(".featuredimage > img", (el) => el.src)
      .catch(() => null)
    const body = await page.$$eval(".regularcontent p", (els) =>
      els.map((e) => e.innerText).join("\n")
    )

    const id = rng(title)().toString()
    const author = "Sport Business Mag"

    await firestore
      .collection("posts")
      .doc(id)
      .set(
        {
          id,
          title,
          body,
          date,
          url,
          imgLink,
          excerpt: body.split("\n")[0],
          author,
          processed: false
        },
        { merge: true }
      )

    console.log(`✅ SBM: ${url}`)
  } catch (e) {
    console.error(`❌ SBM: ${url}`)
  } finally {
    await page.close()
  }
}

async function scrapeDI(browser, urls) {
  const categories = [
    "calcio",
    "serie-a/COuk57CiCdnS0XT8/",
    "tennis",
    "motori",
    "basket",
    "sport-invernali",
    "rugby",
    "ciclismo",
    "sport-usa/dpUlsyANWSzc94ws/",
    "boxe",
    "atletica",
    "nuoto",
    "golf",
    "pallavolo",
    "padel",
    "altri-sport/Mq56jnAtWSzc94ws/",
    "terzo-tempo/vwRW2QShWSzc94ws/",
    "interviste-esclusive/AoPDjjoSWSzc94ws/"
  ]

  for (const category of categories) {
    const page = await browser.newPage()
    await page.setUserAgent(userAgent)

    const url = `https://www.diretta.it/news/${category}/page-5/` // 👈 eventualmente ciclare più pagine qui
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    })

    const allUrls = await page.$$eval(".fsNews a", (elements) =>
      elements
        .map((el) => el.href)
        .filter(
          (el) =>
            el.includes("https://www.diretta.it/news/") &&
            !el.includes("tracker")
        )
    )

    console.log(
      `🔍 DIR category ${category} — ${allUrls.length} articles found`
    )

    for (let i = 0; i < allUrls.length; i++) {
      const id = rng(allUrls[i])().toString() // 👈 usa l'URL come base per ID
      const postRef = firestore.collection("posts").doc(id)
      const postSnap = await postRef.get()

      if (!postSnap.exists) {
        urls.push(allUrls[i])
      } else {
      }
    }

    await page.close()
  }

  console.log(`✅ DIR, queue: ${urls.length}`)
}

async function scrapeCF(browser, urls) {
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

  const allUrls = urlsCF.concat(urlsSF)
  const allTitles = titlesCF.concat(titlesSF)

  for (let i = 0; i < allTitles.length; i++) {
    const id = rng(allTitles[i])().toString()
    const postRef = firestore.collection("posts").doc(id)
    const postSnap = await postRef.get()

    if (!postSnap.exists) {
      urls.push(allUrls[i])
    }
  }
  await page.close()
  console.log(`✅ CF & SF, queue:${urls.length}`)
}

async function scrapeRU(browser, urls) {
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
      const allUrls = await page.$$eval(".article-title", (els) =>
        els.map((el) => el.href)
      )
      const allTitles = await page.$$eval(".article-title > span", (els) =>
        els.map((el) => el.innerText)
      )

      for (let i = 0; i < allTitles.length; i++) {
        const id = rng(allTitles[i])().toString()
        const postRef = firestore.collection("posts").doc(id)
        const postSnap = await postRef.get()

        if (!postSnap.exists) {
          urls.push(allUrls[i])
        }
      }
      await page.close()
    }
  }
  console.log(`✅ RU, queue:${urls.length}`)
}

async function scrapeDS(browser, urls) {
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

    const allUrls = await page.$$eval("h5>a", (elements) =>
      elements.map((element) => element.href)
    )
    const allTitles = await page.$$eval("h5>a", (elements) =>
      elements.map((element) => element.innerText)
    )

    for (let i = 0; i < allTitles.length; i++) {
      const id = rng(allTitles[i])().toString()
      const postRef = firestore.collection("posts").doc(id)
      const postSnap = await postRef.get()

      if (!postSnap.exists) {
        urls.push(allUrls[i])
      }
    }
    await page.close()
  }
  console.log(`✅ DS, queue:${urls.length}`)
}

async function scrapeArticle(browser, url, source) {
  const page = await browser.newPage()
  await page.setUserAgent(userAgent)

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 })

    let data = {}
    let id =
      source === "diretta"
        ? rng(url)().toString()
        : rng(await page.title())().toString()

    switch (source) {
      case "diretta":
        data = {
          title: await page.$eval("h1", (el) => el.innerText),
          date: (
            await page.$eval(
              ".wcl-news-caption-01_gHM5e + meta",
              (el) => el.content
            )
          ).split("T")[0],
          imgLink: await page
            .$eval(".wcl-image_MVcAW", (el) => el.src)
            .catch(() => null),
          excerpt: await page
            .$eval("div.fsNewsArticle__perex", (el) => el.innerText)
            .catch(() => ""),
          body: await page.$$eval("div.fsNewsArticle__content p", (els) =>
            els.map((e) => e.innerText).join("\n")
          ),
          author: "Diretta"
        }
        break

      case "cf":
        data = {
          title: await page.$eval(".a-title>h1", (el) => el.innerText),
          date: (await page.$eval(".a-date>time", (el) => el.dateTime)).split(
            "T"
          )[0],
          imgLink: await page.$eval(".thumb-img", (el) => el.src),
          excerpt: await page.$eval(".a-excerpt p", (el) => el.innerText),
          body: await page.$$eval(".txt-block>p", (els) =>
            els.map((e) => e.innerText).join("/n")
          ),
          author: "Sport & Finanza"
        }
        if (data.body.includes("FPeX") || data.body.includes("Exchange")) return
        break

      case "ru":
        const dateText = await page.$eval(
          ".article-datetime",
          (el) => el.innerText
        )
        data = {
          title: await page.$eval(".article-title", (el) => el.innerText),
          date: new Date(dateText).toISOString().split("T")[0],
          imgLink: await page.$eval(".wp-post-image", (el) => el.src),
          excerpt: await page.$eval(".article-summary", (el) => el.innerText),
          body: await page.$$eval(".article-content > p", (els) =>
            els.map((e) => e.innerText).join("/n")
          ),
          author: "Rivista Undici"
        }
        break

      case "ds":
        const rawDate = await page.$eval("time", (el) =>
          JSON.stringify(
            new Date(
              ...el.outerText
                .split("DEL")
                .pop()
                .split(" ")[0]
                .split("/")
                .reverse()
            )
          )
        )
        data = {
          title: await page.$eval("h1", (el) => el.innerText),
          date: JSON.parse(rawDate).split("T")[0],
          imgLink: await page.$eval("figure > img", (el) => el.src),
          excerpt: await page.$eval("h2", (el) => el.innerText),
          body: await page.$$eval("#articolo  p", (els) =>
            els.map((e) => e.innerText).join("/n")
          ),
          author: "Diritto & Sport"
        }
        break
    }

    await firestore
      .collection("posts")
      .doc(id)
      .set(
        {
          id,
          url,
          processed: false,
          ...data
        },
        { merge: true }
      )

    console.log(`✅ ${source.toUpperCase()}: ${url}`)
  } catch (e) {
    console.error(`❌ ${source.toUpperCase()}: ${url}`)
  } finally {
    await page.close()
  }
}

async function runAllScrapers() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  const urls = []

  await scrapeSBM(browser, urls, "current")
  await scrapeDI(browser, urls)
  await scrapeCF(browser, urls)
  await scrapeRU(browser, urls)
  await scrapeDS(browser, urls)

  console.log(`🔍 Found ${urls.length} new articles to scrape`)

  const pool = new Pool(
    createPromiseProducer(browser, urls, async (b, url) => {
      if (url.includes("sportbusinessmag")) return scrapeArticleSBM(b, url)
      if (url.includes("diretta.it")) return scrapeArticle(b, url, "diretta")
      if (url.includes("calcioefinanza") || url.includes("sportefinanza"))
        return scrapeArticle(b, url, "cf")
      if (url.includes("rivistaundici")) return scrapeArticle(b, url, "ru")
      if (url.includes("italiaoggi")) return scrapeArticle(b, url, "ds")
    }),
    3
  )

  await pool.start()
  await browser.close()
  console.log("✅ Finished scraping all articles")
}

async function deleteDirettaPosts(collection) {
  const snapshot = await firestore
    .collection(collection)
    .where("author", "==", "Diretta")
    .get()

  console.log(`🔍 Trovati ${snapshot.size} documenti con author = "Diretta"`)

  const batchSize = 100
  let count = 0

  while (!snapshot.empty) {
    const batch = firestore.batch()

    snapshot.docs.slice(count, count + batchSize).forEach((doc) => {
      batch.delete(doc.ref)
    })

    await batch.commit()
    count += batchSize
    console.log(`🗑️ Cancellati ${Math.min(count, snapshot.size)} documenti...`)

    if (count >= snapshot.size) break
  }

  console.log("✅ Pulizia completata.")
}

module.exports = { runAllScrapers }
