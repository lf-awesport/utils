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
  try {
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(0)
    await page.goto(url)

    const title = await page.$eval(
      ".titolodettaglio>h1",
      (element) => element.innerText
    )
    const date = await page.$eval(".testatadata-mob", (element) => {
      const dateArray = element.outerText
        .split("DEL")
        .pop()
        .split(" ")[0]
        .split("/")

      return JSON.stringify(
        new Date(
          new Date(
            parseInt(dateArray[2]),
            parseInt(dateArray[1]) - 1,
            parseInt(dateArray[0]) + 1
          )
        )
      ).replace(/['"]+/g, "")
    })

    const author = "Diritto & Sport"
    const imgLink = await page.$eval(".imgleft", (element) => element.src)
    const excerpt = await page.$eval(
      ".sottotitolo",
      (element) => element.innerText
    )
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
        date,
        url,
        id,
        author,
        imgLink
        // eng
      },
      { merge: true }
    )
  } catch (e) {
    console.log(e)
  }
}

const scrapeUrls = async (browser, currentPage, endPage) => {
  try {
    if (currentPage !== endPage) {
      currentPage = currentPage + 1

      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(0)

      await page.goto(
        `https://www.italiaoggi.it/ultime-notizie/diritto-e-sport-01801/${currentPage}`
      )

      const currentUrls = await page.$$eval("section>h3>a", (elements) =>
        elements.map((element) => element.href)
      )
      const currentTitles = await page.$$eval("section>h3>a", (elements) =>
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
  }
}

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: true })

  const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
  dbSnapshot.forEach((doc) => {
    dbIds.push(doc.id)
  })

  console.log("Articoli salvati: " + dbIds.length)

  await scrapeUrls(browser, 0, 1)

  console.log("Nuovi articoli trovati: " + newUrls.length)

  if (newUrls.length > 0) {
    // traslationClient = initTranslationClient()
    const pool = new Pool(promiseProducer(browser, newUrls), 3)
    await pool.start()
  }

  await browser.close()
}

scraper()
