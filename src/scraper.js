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
    this.urls = []
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

  async checkAndAddUrl(url, id) {
    const postRef = firestore.collection("posts").doc(id)
    const postSnap = await postRef.get()
    if (!postSnap.exists) {
      this.urls.push(url)
      return true
    }
    return false
  }

  async saveArticle(data) {
    try {
      await firestore
        .collection("posts")
        .doc(data.id)
        .set({ ...data, processed: false }, { merge: true })
      console.log(`✅ ${data.author}: ${data.url}`)
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
      for (let pageNum = 1; pageNum <= 85; pageNum++) {
        const page = await this.createPage()
        try {
          const url = `https://sportbusinessmag.sport-press.it/${year}/page/${pageNum}/`
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
              await this.checkAndAddUrl(links[i], id)
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
    console.log(`✅ ${this.name}, queue:${this.urls.length}`)
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
        const url = `https://www.diretta.it/news/${category}/page-10/`
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
    console.log(`✅ ${this.name}, queue: ${this.urls.length}`)
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
            ".wcl-news-caption-01_gHM5e + meta",
            (el) => el.content
          )
        ).split("T")[0],
        imgLink: await page
          .$eval(".wcl-image_MVcAW", (el) => el.src)
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

      const allUrls = urlsCF.concat(urlsSF)
      const allTitles = titlesCF.concat(titlesSF)

      for (let i = 0; i < allTitles.length; i++) {
        const id = this.generateId(allTitles[i])
        await this.checkAndAddUrl(allUrls[i], id)
      }
    } catch (error) {
      console.error(
        new ScraperError("Failed to scrape archive", this.name, error)
      )
    } finally {
      await this.closePage(page)
    }
    console.log(`✅ ${this.name}, queue:${this.urls.length}`)
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
      "media",
      "lifestyle",
      "altri-sport",
      "calcio-internazionale",
      "serie-a"
    ]
  }

  async scrapeArchive() {
    for (const category of this.categories) {
      for (let pageNum = 1; pageNum <= 3; pageNum++) {
        const page = await this.createPage()
        try {
          await this.goto(
            page,
            `https://www.rivistaundici.com/category/${category}/page/${pageNum}`
          )

          const urls = await page.$$eval(".article-title", (els) =>
            els.map((el) => el.href)
          )
          const titles = await page.$$eval(".article-title > span", (els) =>
            els.map((el) => el.innerText)
          )

          for (let i = 0; i < titles.length; i++) {
            const id = this.generateId(titles[i])
            await this.checkAndAddUrl(urls[i], id)
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
    console.log(`✅ ${this.name}, queue:${this.urls.length}`)
  }

  async scrapeArticle(url) {
    const page = await this.createPage()
    try {
      await this.goto(page, url)

      const dateText = await page.$eval(
        ".article-datetime",
        (el) => el.innerText
      )
      const data = {
        id: this.generateId(await page.title()),
        title: await page.$eval(".article-title", (el) => el.innerText),
        date: parseItalianDate(dateText),
        imgLink: await page.$eval(".wp-post-image", (el) => el.src),
        excerpt: await page.$eval(".article-summary", (el) => el.innerText),
        body: await page.$$eval(".article-content > p", (els) =>
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
          await this.checkAndAddUrl(urls[i], id)
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
    console.log(`✅ ${this.name}, queue:${this.urls.length}`)
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
      new SBMScraper(browser),
      new DirettaScraper(browser),
      new CFScraper(browser),
      new DSScraper(browser),
      new RUScraper(browser)
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
      if (scraper.urls.length === 0) continue

      console.log(
        `🔍 Processing ${scraper.urls.length} articles from ${scraper.name}`
      )

      try {
        const pool = new Pool(
          createPromiseProducer(browser, scraper.urls, (b, url) =>
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

/**
 * Deletes all posts from a specific source
 */
async function deletePosts(collection, source) {
  try {
    const snapshot = await firestore
      .collection(collection)
      .where("author", "==", source)
      .get()

    console.log(`🔍 Found ${snapshot.size} documents with author = "${source}"`)

    const batchSize = CONFIG.batchSize
    let count = 0

    while (!snapshot.empty) {
      const batch = firestore.batch()

      snapshot.docs.slice(count, count + batchSize).forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
      count += batchSize
      console.log(`🗑️ Deleted ${Math.min(count, snapshot.size)} documents...`)

      if (count >= snapshot.size) break
    }

    console.log("✅ Cleanup completed")
  } catch (error) {
    console.error(
      new ScraperError(`Failed to delete posts from ${source}`, source, error)
    )
  }
}

module.exports = {
  runAllScrapers,
  deletePosts,
  ScraperError,
  CONFIG,
  BaseScraper,
  SBMScraper,
  DirettaScraper,
  CFScraper,
  RUScraper,
  DSScraper,
  createPromiseProducer
}
