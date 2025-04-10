const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const rng = require("seedrandom")
const { firestore } = require("./firebase") // ⚠️ Usa Firestore SDK Cloud

// Helper per evitare duplicati
async function getExistingIds() {
  const snapshot = await firestore.collection("posts").get()
  const ids = new Set()
  snapshot.forEach((doc) => ids.add(doc.id))
  console.log(`🔍 Found ${ids.size}articles in db`)
  return ids
}

// Scraper base condiviso
function createPromiseProducer(browser, urls, scrapeArticle) {
  return () => {
    const url = urls.pop()
    return url ? scrapeArticle(browser, url) : null
  }
}

// 🔹 Calcio & Finanza + Sport & Finanza
async function scrapeCF(browser, dbIds, urls) {
  const page = await browser.newPage()
  await page.goto("https://www.calcioefinanza.it/")
  const urlsCF = await page.$$eval("article>a", (els) => els.map((e) => e.href))
  const titlesCF = await page.$$eval(".post-title", (els) =>
    els.map((e) => e.innerText)
  )

  await page.goto("https://www.sportefinanza.it/")
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
}

async function scrapeArticleCF(browser, url) {
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: "networkidle0" })
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

// 🔹 Rivista Undici
async function scrapeRU(browser, dbIds, urls) {
  const categories = [
    "media",
    "lifestyle",
    "altri-sport",
    "calcio-internazionale",
    "serie-a"
  ]
  for (const category of categories) {
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const page = await browser.newPage()
      await page.goto(
        `https://www.rivistaundici.com/category/${category}/page/${pageNum}`
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
}

async function scrapeArticleRU(browser, url) {
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: "networkidle0" })
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

// 🔹 Main function
async function runAllScrapers() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  })
  const dbIds = await getExistingIds()

  const urls = []

  await scrapeCF(browser, dbIds, urls)
  await scrapeRU(browser, dbIds, urls)

  console.log(`🔍 Found ${urls.length} new articles to scrape`)

  const pool = new Pool(
    createPromiseProducer(browser, urls, async (b, url) => {
      if (url.includes("calcioefinanza") || url.includes("sportefinanza")) {
        return scrapeArticleCF(b, url)
      } else {
        return scrapeArticleRU(b, url)
      }
    }),
    3
  )

  await pool.start()
  await browser.close()
  console.log("✅ Finished scraping all articles")
}

module.exports = { runAllScrapers }

// Run the function immediately (if needed)
// runAllScrapers()

// 🕐 Ogni ora: chiama /update
cron.schedule("0 * * * *", async () => {
  try {
    console.log("🔁 Cron job avviato - chiamata a /update")
    const response = await axios.get("http://localhost:4000/update")
    console.log("✅ Update completato:", response.data)
  } catch (err) {
    console.error("❌ Errore nel cron job:", err.message)
  }
})
