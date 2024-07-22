const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const axios = require("axios")
const rng = require("seedrandom")
const { translateText, initTranslationClient } = require("./translate.js")
const { summarizeContent } = require("./summarize.js")

let client

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
    const date = await page.$eval(
      ".a-date>time",
      (element) => element.innerText
    )
    const author = await page.$eval(".author>a", (element) => element.innerText)
    const imgLink = await page.$eval(".thumb-img", (element) => element.src)
    const excerpt = await page.$eval(
      ".a-excerpt p",
      (element) => element.innerText
    )
    const body = await page.$$eval(".txt-block>p", (elements) =>
      elements.map((e) => e.innerText).join("/n")
    )

    // const eng = await translateText(client, body, "en")

    const copy = await summarizeContent(body)

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
      imgLink,
      // eng,
      copy
    })
  } catch (e) {
    console.log(e)
  }
}

const getArticles = () => axios.get("http://localhost:3000/calciofinanza")

const saveArticle = (articleData) =>
  axios.post("http://localhost:3000/calciofinanza", articleData)

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)

  let newArticles = []

  const db = await getArticles()
  const dbIds = db.data.map((e) => e.id)

  console.log("Articoli presenti: " + db.data.length)

  await page.goto("https://www.calcioefinanza.it/")

  const articleUrls = await page.$$eval("article>a", (elements) =>
    elements.map((element) => element.href)
  )
  const articleTitles = await page.$$eval(".post-title", (elements) =>
    elements.map((element) => element.innerText)
  )
  const articleIds = articleTitles.map((e) => rng(e)().toString())

  for (let i = 0; i < articleIds.length; i++) {
    if (!dbIds.includes(articleIds[i])) {
      newArticles.push(articleUrls[i])
    }
  }

  console.log("Nuovi articoli trovati: " + newArticles.length)

  await page.close()

  if (newArticles.length > 0) {
    client = initTranslationClient()
    const pool = new Pool(promiseProducer(browser, newArticles.slice(0, 3)), 3)
    await pool.start()
  }

  await browser.close()
}

scraper()
