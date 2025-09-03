const puppeteer = require("puppeteer")
const Pool = require("es6-promise-pool")
const rng = require("seedrandom")
const { firestore } = require("./firebase") // ⚠️ Usa Firestore SDK Cloud

//helper function to parse italian date
function parseItalianDate(dateStr) {
  const months = {
    gennaio: "01",
    febbraio: "02",
    marzo: "03",
    aprile: "04",
    maggio: "05",
    giugno: "06",
    luglio: "07",
    agosto: "08",
    settembre: "09",
    ottobre: "10",
    novembre: "11",
    dicembre: "12"
  }

  const [day, monthName, year] = dateStr.toLowerCase().split(" ")
  const month = months[monthName]

  if (!month) throw new Error(`Mese non riconosciuto: ${monthName}`)

  return `${year}-${month}-${day.padStart(2, "0")}`
}

/**
 * Default configuration for scrapers
 */
const CONFIG = {
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
  pageOptions: {
    waitUntil: "networkidle2",
    timeout: 60000
  },
  concurrency: 3,
  batchSize: 50
}

/**
 * Custom error class for scraping related errors
 */
class ScraperError extends Error {
  constructor(message, source = null, originalError = null) {
    super(message)
    this.name = "ScraperError"
    this.source = source
    this.originalError = originalError
  }
}

/**
 * Base scraper class with common functionality
 */
class BaseScraper {
  constructor(browser) {
    this.browser = browser
    this.urls = new Set()
  }

  async createPage() {
    const page = await this.browser.newPage()
    await page.setUserAgent(CONFIG.userAgent)
    return page
  }

  async closePage(page) {
    if (page) await page.close()
  }

  async goto(page, url) {
    await page.goto(url, CONFIG.pageOptions)
  }

  generateId(seed) {
    return rng(seed)().toString()
  }

  async checkAndAddUrl(url, id, title = null) {
    const cleanUrl = url?.trim()
    const cleanTitle = title?.trim()

    // 🔍 1. Check per ID
    const postRef = firestore.collection("posts").doc(id)
    const postSnap = await postRef.get()

    if (postSnap.exists) {
      const existing = postSnap.data()
      const sameUrl = existing.url?.trim() === cleanUrl
      const sameTitle = existing.title?.trim() === cleanTitle

      if (sameUrl || sameTitle) {
        return false
      }
      return false
    }

    // 🔍 2. Check per URL
    if (cleanUrl) {
      const urlSnap = await firestore
        .collection("posts")
        .where("url", "==", cleanUrl)
        .limit(1)
        .get()

      if (!urlSnap.empty) {
        return false
      }
    }

    // 🔍 3. Check per titolo
    if (cleanTitle) {
      const titleSnap = await firestore
        .collection("posts")
        .where("title", "==", cleanTitle)
        .limit(1)
        .get()

      if (!titleSnap.empty) {
        return false
      }
    }

    // ✅ Se non esiste nessuno dei tre → aggiungi
    this.urls.add(url)
    return true
  }

  async saveArticle(data) {
    // Check obbligatori
    if (!data.body || !data.date || !data.imgLink) {
      throw new ScraperError(
        `Articolo non salvato: campo mancante (${!data.body ? "body" : !data.date ? "date" : "imgLink"}) in ${data.url}`,
        data.author
      )
    }
    try {
      await firestore
        .collection("posts")
        .doc(data.id)
        .set({ ...data, processed: false }, { merge: true })
    } catch (error) {
      console.error(
        new ScraperError(
          `Failed to save article: ${data.url}`,
          data.author,
          error
        )
      )
    }
  }
}

/**
 * Sport Business Mag scraper
 */
class SBMScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "Sport Business Mag"
  }

  extractDateFromUrl(url) {
    const match = url.match(/\/([0-9]{4})\/([0-9]{2})\/([0-9]{2})\//)
    if (!match) return null
    const [_, year, month, day] = match
    return `${year}-${month}-${day}`
  }

  isValidArticleUrl(url) {
    return /\/20[2-5][0-9]\/[01][0-9]\/[0-3][0-9]\//.test(url)
  }

  async scrapeArchive(mode = "current") {
    const startYear = mode === "all" ? 2016 : 2025
    const endYear = mode === "all" ? 2025 : 2025

    for (let year = startYear; year <= endYear; year++) {
      for (let pageNum = 1; pageNum <= 3; pageNum++) {
        const page = await this.createPage()
        const url = `https://sportbusinessmag.sport-press.it/${year}/page/${pageNum}/`
        try {
          await this.goto(page, url)

          const links = await page.$$eval("figure a", (els) => [
            ...new Set(els.map((el) => el.href))
          ])
          if (links.length === 0) break

          const titles = await page.$$eval(".post-content h2.title", (els) =>
            els.map((el) => el.innerText)
          )

          for (let i = 0; i < titles.length; i++) {
            const id = this.generateId(titles[i])
            if (links[i] && this.isValidArticleUrl(links[i])) {
              await this.checkAndAddUrl(links[i], id, titles[i])
            }
          }
        } catch (error) {
          console.error(
            new ScraperError(`Archive error: ${url}`, this.name, error)
          )
        } finally {
          await this.closePage(page)
        }
      }
    }
    console.log(`✅ ${this.name}, queue:${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const title = await page.$eval("h1.title", (el) => el.innerText)
      const date = this.extractDateFromUrl(url)
      const imgLink = await page
        .$eval(".featuredimage > img", (el) => el.src)
        .catch(() => null)
      const body = await page.$$eval(".regularcontent p", (els) =>
        els.map((e) => e.innerText).join("\n")
      )

      const data = {
        id: this.generateId(title),
        title,
        body,
        date,
        url,
        imgLink,
        excerpt: body.split("\n")[0],
        author: this.name
      }

      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * Diretta.it scraper
 */
class DirettaScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "Diretta"
    this.categories = [
      "calcio",
      "serie-a/COuk57CiCdnS0XT8/",
      "tennis",
      "motori",
      "basket",
      "sport-invernali",
      "rugby",
      "ciclismo",
      "sport-usa/dpUlsyANWSzc94ws/",
      "boxe",
      "atletica",
      "nuoto",
      "golf",
      "pallavolo",
      "padel",
      "altri-sport/Mq56jnAtWSzc94ws/",
      "terzo-tempo/vwRW2QShWSzc94ws/",
      "interviste-esclusive/AoPDjjoSWSzc94ws/"
    ]
  }

  async scrapeArchive() {
    for (const category of this.categories) {
      const page = await this.createPage()
      try {
        const url = `https://www.diretta.it/news/${category}/page-5/`
        await this.goto(page, url)

        const urls = await page.$$eval(".fsNews a", (elements) =>
          elements
            .map((el) => el.href)
            .filter(
              (el) =>
                el.includes("https://www.diretta.it/news/") &&
                !el.includes("tracker")
            )
        )
        for (const url of urls) {
          if (this.urls.has(url)) {
            continue // ⚠️ già in queue, salta
          }

          const id = this.generateId(url)
          await this.checkAndAddUrl(url, id)
        }
      } catch (error) {
        console.error(
          new ScraperError(
            `Failed to scrape category: ${category}`,
            this.name,
            error
          )
        )
      } finally {
        await this.closePage(page)
      }
    }
    console.log(`✅ ${this.name}, queue: ${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const data = {
        id: this.generateId(url),
        title: await page.$eval("h1", (el) => el.innerText),
        date: (
          await page.$eval(
            ".wcl-news-caption-01_w0qls + meta",
            (el) => el.content
          )
        ).split("T")[0],
        imgLink: await page
          .$eval("wcl-picture_xJTTl > img", (el) => el.src)
          .catch(() => null),
        excerpt: await page
          .$eval("div.fsNewsArticle__perex", (el) => el.innerText)
          .catch(() => ""),
        body: await page.$$eval("div.fsNewsArticle__content p", (els) =>
          els.map((e) => e.innerText).join("\n")
        ),
        url,
        author: this.name
      }

      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * Calcio e Finanza scraper
 */
class CFScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "Sport & Finanza"
  }

  async scrapeArchive() {
    const page = await this.createPage()
    try {
      // Scrape Calcio e Finanza
      await this.goto(page, "https://www.calcioefinanza.it/")
      const urlsCF = await page.$$eval("article>a", (els) =>
        els.map((e) => e.href)
      )
      const titlesCF = await page.$$eval(".post-title", (els) =>
        els.map((e) => e.innerText)
      )

      // Scrape Sport e Finanza
      await this.goto(page, "https://www.sportefinanza.it/")
      const urlsSF = await page.$$eval("article>a", (els) =>
        els.map((e) => e.href)
      )
      const titlesSF = await page.$$eval(".post-title", (els) =>
        els.map((e) => e.innerText)
      )

      const urls = urlsCF.concat(urlsSF)
      const titles = titlesCF.concat(titlesSF)

      for (let i = 0; i < titles.length; i++) {
        const title = titles[i]
        const url = urls[i]

        if (!title || !url) {
          console.warn(`⚠️ Skipping missing title/url at index ${i}`)
          continue
        }

        const id = this.generateId(title)
        await this.checkAndAddUrl(urls[i], id, titles[i])
      }
    } catch (error) {
      console.error(
        new ScraperError("Failed to scrape archive", this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
    console.log(`✅ ${this.name}, queue:${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const data = {
        id: this.generateId(await page.title()),
        title: await page.$eval(".a-title>h1", (el) => el.innerText),
        date: (await page.$eval(".a-date>time", (el) => el.dateTime)).split(
          "T"
        )[0],
        imgLink: await page.$eval(".thumb-img", (el) => el.src),
        excerpt: await page.$eval(".a-excerpt p", (el) => el.innerText),
        body: await page.$$eval(".txt-block>p", (els) =>
          els.map((e) => e.innerText).join("\n")
        ),
        url,
        author: this.name
      }

      // Skip articles about FPeX or Exchange
      if (data.body.includes("FPeX") || data.body.includes("Exchange")) return

      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * Rivista Undici scraper
 */
class RUScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "Rivista Undici"
    this.categories = [
      "calcio",
      "tennis",
      "formula-1",
      "lifestyle",
      "altri-sport"
    ]
  }

  async scrapeArchive() {
    for (const category of this.categories) {
      for (let pageNum = 1; pageNum <= 5; pageNum++) {
        const page = await this.createPage()
        try {
          await this.goto(
            page,
            `https://www.rivistaundici.com/category/${category}/page/${pageNum}`
          )

          const urls = await page.$$eval("div.article-g > a", (els) =>
            els.map((el) => el.href)
          )
          const titles = await page.$$eval("h2.title-small", (els) =>
            els.map((el) => el.innerText)
          )
          for (let i = 0; i < titles.length; i++) {
            const id = this.generateId(titles[i])
            await this.checkAndAddUrl(urls[i], id, titles[i])
          }
        } catch (error) {
          console.error(
            new ScraperError(
              `Failed to scrape category: ${category}, page: ${pageNum}`,
              this.name,
              error
            )
          )
        } finally {
          await this.closePage(page)
        }
      }
    }
    console.log(`✅ ${this.name}, queue:${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      // Estrai la data nel formato '14 Agosto 2025 alle 15:34'
      const dateText = await page.$eval(".data", (el) => el.innerText)
      // Regex per estrarre solo la parte data
      const match = dateText.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
      let isoDate = null
      if (match) {
        const [_, day, monthName, year] = match
        const months = {
          gennaio: "01",
          febbraio: "02",
          marzo: "03",
          aprile: "04",
          maggio: "05",
          giugno: "06",
          luglio: "07",
          agosto: "08",
          settembre: "09",
          ottobre: "10",
          novembre: "11",
          dicembre: "12"
        }
        const month = months[monthName.toLowerCase()]
        if (month) {
          isoDate = `${year}-${month}-${day.padStart(2, "0")}`
        }
      }

      const data = {
        id: this.generateId(await page.title()),
        title: await page.$eval("h1.title-medium", (el) => el.innerText),
        date: isoDate,
        imgLink: await page.$eval(
          "div.testata-articolo_right > img",
          (el) => el.src
        ),
        excerpt: await page.$eval(".text-secondary", (el) => el.innerText),
        body: await page.$$eval(".contenuto-articolo > p", (els) =>
          els.map((e) => e.innerText).join("\n")
        ),
        url,
        author: this.name
      }
      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * Diritto & Sport scraper
 */
class DSScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "Diritto & Sport"
  }

  async scrapeArchive() {
    for (let currentPage = 1; currentPage <= 6; currentPage++) {
      const page = await this.createPage()
      try {
        await this.goto(
          page,
          `https://www.italiaoggi.it/settori/sport?page=${currentPage}`
        )

        const urls = await page.$$eval("h5>a", (els) =>
          els.map((el) => el.href)
        )
        const titles = await page.$$eval("h5>a", (els) =>
          els.map((el) => el.innerText)
        )

        for (let i = 0; i < titles.length; i++) {
          const id = this.generateId(titles[i])
          await this.checkAndAddUrl(urls[i], id, titles[i])
        }
      } catch (error) {
        console.error(
          new ScraperError(
            `Failed to scrape page: ${currentPage}`,
            this.name,
            error
          )
        )
      } finally {
        await this.closePage(page)
      }
    }
    console.log(`✅ ${this.name}, queue:${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const rawDate = await page.$eval("time", (el) => {
        const dateText = el.outerText.split("DEL").pop().trim()
        const [day, month, year] = dateText
          .split("/")
          .map((num) => parseInt(num, 10))
        // Create date object with correct month (0-based) and day
        return new Date(year, month - 1, day + 1).toISOString().split("T")[0]
      })

      const data = {
        id: this.generateId(await page.title()),
        title: await page.$eval("h1", (el) => el.innerText),
        date: rawDate,
        imgLink: await page.$eval("figure > img", (el) => el.src),
        excerpt: await page.$eval("h2", (el) => el.innerText),
        body: await page.$$eval("#articolo p", (els) =>
          els.map((e) => e.innerText).join("\n")
        ),
        url,
        author: this.name
      }

      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * NSS Sports scraper
 */
class NSSScraper extends BaseScraper {
  constructor(browser) {
    super(browser)
    this.name = "NSS Sports"
  }

  async scrapeArchive() {
    for (let pageNum = 1; pageNum <= 5; pageNum++) {
      const page = await this.createPage()
      try {
        const url = `https://www.nss-sports.com/it/articles/page-${pageNum}`
        await this.goto(page, url)

        const urls = await page.$$eval("a.o-article-card__link", (els) =>
          els.map((e) => e.href)
        )
        const titles = await page.$$eval("h4.o-article-card-title", (els) =>
          els.map((e) => e.innerText)
        )

        for (let i = 0; i < urls.length; i++) {
          const id = this.generateId(titles[i])
          await this.checkAndAddUrl(urls[i], id, titles[i])
        }
      } catch (error) {
        console.error(
          new ScraperError(
            `Failed to scrape archive page ${pageNum}`,
            this.name,
            error
          )
        )
      } finally {
        await this.closePage(page)
      }
    }
    console.log(`✅ ${this.name}, queue: ${this.urls.size}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const fullTitle = await page.$eval("h1", (el) => el.innerText)
      const [title, excerpt] = fullTitle.split("\n").map((part) => part.trim())

      const rawDate = await page.$eval(
        ".article-category-label",
        (el) => el.innerText
      )
      const match = rawDate.match(/\d{1,2} [A-Za-z]+ \d{4}/)
      const date = match ? parseItalianDate(match[0]) : null

      // scroll + wait per Lazy Loading Immagini
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0
          const distance = 200
          const timer = setInterval(() => {
            window.scrollBy(0, distance)
            totalHeight += distance
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer)
              resolve()
            }
          }, 100)
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const imgLink =
        (await page.$eval("#article-wrapper img", (img) => img.src)) ||
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTg069zNlygmPwtQEl0CAwoucC5Xlvo9phUUw&s"

      const bodyParagraphs = await page.$$eval(".post-text > p", (els) =>
        els.map((el) => el.innerText).filter(Boolean)
      )
      const body = bodyParagraphs.join("\n")

      const data = {
        id: this.generateId(title),
        title,
        date,
        url,
        imgLink,
        body,
        excerpt: excerpt || "",
        author: this.name
      }

      await this.saveArticle(data)
    } catch (error) {
      console.error(
        new ScraperError(`Failed to scrape article: ${url}`, this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
  }
}

/**
 * Creates a promise producer for parallel processing
 */
function createPromiseProducer(browser, urls, scrapeArticle) {
  return () => {
    const url = urls.pop()
    return url ? scrapeArticle(browser, url) : null
  }
}

/**
 * Runs all scrapers to collect and process articles
 */
async function runAllScrapers() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  try {
    // Initialize scrapers
    const scrapers = [
      // new SBMScraper(browser),
      // new DirettaScraper(browser),
      // new CFScraper(browser),
      // new DSScraper(browser),
      new RUScraper(browser)
      // new NSSScraper(browser)
    ]

    // Scrape archives
    for (const scraper of scrapers) {
      try {
        await scraper.scrapeArchive()
      } catch (error) {
        console.error(
          new ScraperError(
            `Failed to scrape archive for ${scraper.name}`,
            scraper.name,
            error
          )
        )
      }
    }

    // Process articles in parallel
    for (const scraper of scrapers) {
      if (scraper.urls.size === 0) continue

      console.log(
        `🔍 Processing ${scraper.urls.size} articles from ${scraper.name}`
      )

      try {
        const pool = new Pool(
          createPromiseProducer(browser, Array.from(scraper.urls), (b, url) =>
            scraper.scrapeArticle(url)
          ),
          CONFIG.concurrency
        )
        await pool.start()
      } catch (error) {
        console.error(
          new ScraperError(
            `Failed to process articles for ${scraper.name}`,
            scraper.name,
            error
          )
        )
      }
    }

    console.log("✅ Finished scraping all articles")
  } catch (error) {
    console.error(
      new ScraperError("Fatal error in runAllScrapers", null, error)
    )
  } finally {
    await browser.close()
  }
}

module.exports = {
  runAllScrapers,
  ScraperError,
  CONFIG,
  BaseScraper,
  SBMScraper,
  DirettaScraper,
  CFScraper,
  RUScraper,
  DSScraper,
  NSSScraper,
  createPromiseProducer
}
