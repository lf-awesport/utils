const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const axios = require("axios")
const rng = require("seedrandom")

const formatDate = (date = new Date()) => {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = "0" + month
  if (day.length < 2) day = "0" + day

  return [year, month, day].join("/")
}

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
  const excerpt = await page.$eval(
    ".a-excerpt>p",
    (element) => element.innerText
  )
  const body = await page.$$eval(".txt-block>p", (elements) =>
    elements.map((e) => e.innerText).join("/n")
  )

  const id = rng(title)()

  await page.close()

  await saveArticle({ title, excerpt, body, date, url, id, author })
}

const getArticles = () => axios.get("http://localhost:3000/calciofinanza")

const saveArticle = ({ title, excerpt, body, date, url, id, author }) =>
  axios.post("http://localhost:3000/calciofinanza", {
    title,
    excerpt,
    body,
    date,
    url,
    id,
    author
  })

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: false })
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
  const articleIds = articleTitles.map((e) => rng(e)())

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
