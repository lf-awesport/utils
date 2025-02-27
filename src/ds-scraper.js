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
    await page.goto(url)

    const title = await page.$eval("h1", (element) => element.innerText)
    const date = await page.$eval("time", (element) => {
      const dateArray = element.outerText.split("/")

      return JSON.stringify(
        new Date(
          parseInt(dateArray[2]),
          parseInt(dateArray[1]) - 1,
          parseInt(dateArray[0]) + 1
        )
      ).replace(/['"]+/g, "")
    })

    const author = "Diritto & Sport"
    const excerpt = await page.$eval("h2", (element) => element.innerText)
    const body = await page.$$eval("#articolo  p", (elements) =>
      elements.map((e) => e.innerText).join("/n")
    )

    await page.close()
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
        imgLink:
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpI6WrclD8SPcet1PS9_aAFZSAZM0Bpoms4Q&s"
        // eng
      },
      { merge: true }
    )
    console.log(`✅: ${url}`)
  } catch (e) {
    console.log(`❌: ${e}`)
  }
}

const scrapeUrls = async (browser, currentPage, endPage) => {
  try {
    if (currentPage !== endPage) {
      currentPage = currentPage + 1

      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(0)

      await page.goto(
        `https://www.italiaoggi.it/settori/sport?page=${currentPage}`
      )

      const currentUrls = await page.$$eval("h5>a", (elements) =>
        elements.map((element) => element.href)
      )
      const currentTitles = await page.$$eval("h5>a", (elements) =>
        elements.map((element) => element.innerText)
      )

      await page.close()

      const currentIds = currentTitles.map((e) => rng(e)().toString())

      for (let i = 0; i < currentIds.length; i++) {
        if (!dbIds.includes(currentIds[i])) {
          newUrls.push(currentUrls[i])
        }
      }
      return scrapeUrls(browser, currentPage, endPage)
    }
  } catch (err) {
    console.log(err)
    await page.close()
  }
}

const dsScraper = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
  dbSnapshot.forEach((doc) => {
    dbIds.push(doc.id)
  })

  console.log("Articoli salvati: " + dbIds.length)

  await scrapeUrls(browser, 0, 50)

  console.log("Nuovi articoli trovati: " + newUrls.length)

  if (newUrls.length > 0) {
    // traslationClient = initTranslationClient()
    const pool = new Pool(promiseProducer(browser, newUrls), 3)
    await pool.start()
  }

  await browser.close()
}

module.exports.dsScraper = dsScraper
