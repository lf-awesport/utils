const puppeteer = require("puppeteer")

const formatDate = (date = new Date()) => {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = "0" + month
  if (day.length < 2) day = "0" + day

  return [year, month, day].join("/")
}

const scraper = async (date) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto("https://www.calcioefinanza.it/")

  const sel = "article>a"

  await page.evaluate(
    (sel, date) => {
      let elements = Array.from(document.querySelectorAll(sel))
      let articles = elements.map((element) => {
        return element.href
      })
      console.log(articles)
      const dailyArticles = articles.filter((a) => a.incudes(date))
      return dailyArticles
    },
    sel,
    date
  )

  console.log(dailyArticles)
}

scraper(formatDate())
