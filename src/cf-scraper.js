const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const axios = require("axios")

const formatDate = (date = new Date()) => {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = "0" + month
  if (day.length < 2) day = "0" + day

  return [year, month, day].join("/")
}

const promiseProducer = (browser, links, date) => () => {
  const link = links.pop()
  return link ? scrapeArticle(browser, link, date) : null
}

const scrapeArticle = async (browser, link, date) => {
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)
  await page.goto(link)

  const title = await page.$eval(".a-title>h1", (element) => element.innerText)
  const excerpt = await page.$eval(
    ".a-excerpt>p",
    (element) => element.innerText
  )
  const body = await page.$$eval(".txt-block>p", (elements) =>
    elements.map((e) => e.innerText).join("/n")
  )

  await page.close()

  return saveArticle(title, excerpt, body, date)
}

const saveArticle = (title, excerpt, body, date, url) =>
  axios.post("http://localhost:3000/articles", {
    title,
    excerpt,
    body,
    date,
    url,
    id: date + title
  })

const scraper = async () => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)

  await page.goto("https://www.calcioefinanza.it/")

  const sel = "article>a"

  const articles = await page.$$eval(sel, (elements) =>
    elements.map((element) => element.href)
  )
  // const date = formatDate()

  const date = "2024/07/03"

  const dailyArticles = articles.filter((a) => a.includes(date))

  await page.close()

  const pool = new Pool(promiseProducer(browser, dailyArticles, date), 3)
  await pool.start()

  await browser.close()
}

scraper()
