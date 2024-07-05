const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const axios = require("axios")
const rng = require("seedrandom")

const promiseProducer = (browser, urls) => () => {
  const url = urls.pop()
  return url ? scrapeArticle(browser, url) : null
}

const scrapeArticle = async (browser, url) => {
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)
  await page.goto(url)

  const title = await page.$eval(".a-title>h1", (element) => element.innerText)
  const date = await page.$eval(".a-date>time", (element) => element.innerText)
  const author = await page.$eval(".author>a", (element) => element.innerText)
  const imgLink = await page.$eval(".thumb-img", (element) => element.src)
  const excerpt = await page.$eval(
    ".a-excerpt>p",
    (element) => element.innerText
  )
  const body = await page.$$eval(".txt-block>p", (elements) =>
    elements.map((e) => e.innerText).join("/n")
  )

  const id = rng(title)().toString()

  await page.close()

  await saveArticle({ title, excerpt, body, date, url, id, author, imgLink })
}

const getArticles = () => axios.get("http://localhost:3000/sportfinanza")

const saveArticle = ({
  title,
  excerpt,
  body,
  date,
  url,
  id,
  author,
  imgLink
}) =>
  axios.post("http://localhost:3000/sportfinanza", {
    title,
    excerpt,
    body,
    date,
    url,
    id,
    author,
    imgLink
  })

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)

  let newArticles = []

  const db = await getArticles()
  const dbIds = db.data.map((e) => e.id)

  console.log("Articoli presenti: " + db.data.length)

  await page.goto("https://www.sportefinanza.it/")

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

  const pool = new Pool(promiseProducer(browser, newArticles), 3)
  await pool.start()

  await browser.close()
}

scraper()
