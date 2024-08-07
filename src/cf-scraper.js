const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const axios = require("axios")
const rng = require("seedrandom")
const _ = require("lodash")
// const { translateText, initTranslationClient } = require("./translate.js")

let traslationClient

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
      ".a-title>h1",
      (element) => element.innerText
    )
    const date = await page.$eval(".a-date>time", (element) => element.dateTime)
    const author = await page.$eval(".author>a", (element) => element.innerText)
    const imgLink = await page.$eval(".thumb-img", (element) => element.src)
    const excerpt = await page.$eval(
      ".a-excerpt p",
      (element) => element.innerText
    )
    const body = await page.$$eval(".txt-block>p", (elements) =>
      elements.map((e) => e.innerText).join("/n")
    )

    if (body.includes("FPeX") || body.includes("Exchange")) return

    // const eng = await translateText(client, body, "en")

    const id = rng(title)().toString()

    await page.close()

    await saveArticle({
      title,
      excerpt,
      body,
      date,
      url,
      id,
      author,
      imgLink
      // eng
    })
  } catch (e) {
    console.log(e)
  }
}

const getArticles = () => axios.get("http://localhost:8000/calciofinanza")

const saveArticle = (articleData) =>
  axios.post("http://localhost:8000/calciofinanza", articleData)

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)

  let newArticles = []
  let articleUrls = []
  let articleTitles = []

  const db = await getArticles()
  const dbIds = db.data.map((e) => e.id)

  console.log("Articoli presenti: " + db.data.length)

  await page.goto("https://www.calcioefinanza.it/")

  const articleUrlsCF = await page.$$eval("article>a", (elements) =>
    elements.map((element) => element.href)
  )
  const articleTitlesCF = await page.$$eval(".post-title", (elements) =>
    elements.map((element) => element.innerText)
  )

  await page.goto("https://www.sportefinanza.it/")

  const articleUrlsSF = await page.$$eval("article>a", (elements) =>
    elements.map((element) => element.href)
  )
  const articleTitlesSF = await page.$$eval(".post-title", (elements) =>
    elements.map((element) => element.innerText)
  )

  articleUrls = articleUrlsCF.concat(articleUrlsSF)
  articleTitles = articleTitlesCF.concat(articleTitlesSF)

  const articleIds = articleTitles.map((e) => rng(e)().toString())

  for (let i = 0; i < articleIds.length; i++) {
    if (!dbIds.includes(articleIds[i])) {
      newArticles.push(articleUrls[i])
    }
  }

  console.log("Nuovi articoli trovati: " + newArticles.length)

  await page.close()

  if (newArticles.length > 0) {
    // traslationClient = initTranslationClient()
    const pool = new Pool(promiseProducer(browser, newArticles), 3)
    await pool.start()
  }

  await browser.close()
}

scraper()
