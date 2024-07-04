const puppeteer = require("puppeteer")
const pool = require("es6-promise-pool")

const formatDate = (date = new Date()) => {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = "0" + month
  if (day.length < 2) day = "0" + day

  return [year, month, day].join("/")
}

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

  const date = "2024/07/02"

  const dailyArticles = articles.filter((a) => a.includes(date))

  await page.close()
  await browser.close()
}

scraper()
