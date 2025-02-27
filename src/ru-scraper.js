const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const rng = require("seedrandom")
const _ = require("lodash")
const { collection, doc, setDoc, getDocs } = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")

// const { translateText, initTranslationClient } = require("./translate.js")

//todo => create a single function for each html element so that errors can be handled more gracefully and undefined values can be replaced by defaults

// let traslationClient
let newUrls = []
let dbIds = []

const promiseProducer = (browser, urls) => () => {
  const url = urls.pop()
  return url ? scrapeArticle(browser, url) : null
}

const scrapeArticle = async (browser, url) => {
  const page = await browser.newPage()
  try {
    page.setDefaultNavigationTimeout(0)
    await page.goto(url, { waitUntil: "networkidle0" })

    const title = await page.$eval(
      ".article-title",
      (element) => element.innerText
    )
    const date = await page.$eval(".article-datetime", (element) => {
      const dateArray = element.outerText.split(" ")

      const getMonth = {
        Gennaio: 1,
        Febbraio: 2,
        Marzo: 3,
        Aprile: 4,
        Maggio: 5,
        Giugno: 6,
        Luglio: 7,
        Agosto: 8,
        Settembre: 9,
        Ottobre: 10,
        Novembre: 11,
        Dicembre: 12
      }

      return JSON.stringify(
        new Date(
          parseInt(dateArray[2]),
          getMonth[dateArray[1]] - 1,
          parseInt(dateArray[0]) + 1
        )
      ).replace(/['"]+/g, "")
    })

    const author = "Rivista Undici"
    const imgLink = await page.$eval(".wp-post-image", (element) => element.src)
    const excerpt = await page.$eval(
      ".article-summary",
      (element) => element.innerText
    )
    const body = await page.$$eval(".article-content >  p", (elements) =>
      elements.map((e) => e.innerText).join("/n")
    )

    // const eng = await translateText(client, body, "en")

    const id = rng(title)().toString()

    await setDoc(
      doc(firebaseApp, "posts", id),
      {
        title,
        excerpt,
        body,
        date: date.split("T")[0],
        url,
        id,
        author,
        imgLink
        // eng
      },
      { merge: true }
    )
    console.log(`✅: ${url}`)
    await page.close()
  } catch (e) {
    console.log(`❌: ${url}`)
    await page.close()
  }
}

const scrapeUrls = async (browser, category, currentPage, endPage) => {
  try {
    if (currentPage !== endPage) {
      currentPage = currentPage + 1

      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(0)

      await page.goto(
        `https://www.rivistaundici.com/category/${category}/page/${currentPage}`
      )

      const currentUrls = await page.$$eval(".article-title", (elements) =>
        elements.map((element) => element.href)
      )
      const currentTitles = await page.$$eval(
        ".article-title > span",
        (elements) => elements.map((element) => element.innerText)
      )

      await page.close()

      const currentIds = currentTitles.map((e) => rng(e)().toString())

      for (let i = 0; i < currentIds.length; i++) {
        if (!dbIds.includes(currentIds[i])) {
          newUrls.push(currentUrls[i])
        }
      }

      return scrapeUrls(browser, category, currentPage, endPage)
    }
  } catch (err) {
    console.log(err)
  }
}

const ruScraper = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
  dbSnapshot.forEach((doc) => {
    dbIds.push(doc.id)
  })

  console.log("Articoli salvati: " + dbIds.length)

  await scrapeUrls(browser, "media", 0, 50)
  await scrapeUrls(browser, "lifestyle", 0, 50)
  await scrapeUrls(browser, "altri-sport", 0, 50)
  await scrapeUrls(browser, "calcio-internazionale", 0, 50)
  await scrapeUrls(browser, "serie-a", 0, 50)

  console.log("Nuovi articoli trovati: " + newUrls.length)

  if (newUrls.length > 0) {
    // traslationClient = initTranslationClient()
    const pool = new Pool(promiseProducer(browser, newUrls), 3)
    await pool.start()
  }

  await browser.close()
}

module.exports.ruScraper = ruScraper
