const puppeteer = require("puppeteer")
const {
  ScraperError,
  BaseScraper,
  SBMScraper,
  DirettaScraper,
  CFScraper,
  RUScraper,
  DSScraper,
  createPromiseProducer,
  runAllScrapers
} = require("../scraper")

// Mock puppeteer
jest.mock("puppeteer", () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setUserAgent: jest.fn().mockResolvedValue(),
      goto: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      $eval: jest.fn().mockResolvedValue("test"),
      $$eval: jest.fn().mockResolvedValue(["test1", "test2"]),
      title: jest.fn().mockResolvedValue("Test Title")
    }),
    close: jest.fn().mockResolvedValue()
  })
}))

// Mock firestore
jest.mock("../firebase", () => ({
  firestore: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue()
      })
    })
  }
}))

describe("Scraper Module", () => {
  let browser
  let page

  beforeEach(async () => {
    browser = await puppeteer.launch()
    page = await browser.newPage()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await browser.close()
  })

  describe("ScraperError", () => {
    it("should create error with message", () => {
      const error = new ScraperError("Test error")
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("ScraperError")
      expect(error.message).toBe("Test error")
      expect(error.source).toBeNull()
      expect(error.originalError).toBeNull()
    })

    it("should create error with source and original error", () => {
      const originalError = new Error("Original error")
      const error = new ScraperError("Test error", "TestSource", originalError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("ScraperError")
      expect(error.message).toBe("Test error")
      expect(error.source).toBe("TestSource")
      expect(error.originalError).toBe(originalError)
    })
  })

  describe("BaseScraper", () => {
    let baseScraper

    beforeEach(() => {
      baseScraper = new BaseScraper(browser)
    })

    it("should create a new page", async () => {
      const newPage = await baseScraper.createPage()
      expect(newPage).toBeDefined()
      expect(newPage.setUserAgent).toHaveBeenCalled()
    })

    it("should close a page", async () => {
      await baseScraper.closePage(page)
      expect(page.close).toHaveBeenCalled()
    })

    it("should navigate to a URL", async () => {
      await baseScraper.goto(page, "https://example.com")
      expect(page.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      )
    })

    it("should generate a deterministic ID", () => {
      const id1 = baseScraper.generateId("test")
      const id2 = baseScraper.generateId("test")
      expect(id1).toBe(id2)
    })

    it("should check and add URL if not exists", async () => {
      const result = await baseScraper.checkAndAddUrl(
        "https://example.com",
        "test-id"
      )
      expect(result).toBe(true)
      expect(baseScraper.urls).toContain("https://example.com")
    })

    it("should save article data", async () => {
      const data = {
        id: "test-id",
        title: "Test Title",
        body: "Test Body",
        date: "2024-01-01",
        url: "https://example.com",
        imgLink: "https://example.com/image.jpg",
        excerpt: "Test Excerpt",
        author: "Test Author"
      }
      await baseScraper.saveArticle(data)
      expect(require("../firebase").firestore.collection).toHaveBeenCalledWith(
        "posts"
      )
    })
  })

  describe("SBMScraper", () => {
    let sbmScraper

    beforeEach(() => {
      sbmScraper = new SBMScraper(browser)
    })

    it("should extract date from URL", () => {
      const date = sbmScraper.extractDateFromUrl(
        "https://example.com/2024/01/01/test"
      )
      expect(date).toBe("2024-01-01")
    })

    it("should validate article URL", () => {
      expect(
        sbmScraper.isValidArticleUrl("https://example.com/2024/01/01/test")
      ).toBe(true)
      expect(sbmScraper.isValidArticleUrl("https://example.com/test")).toBe(
        false
      )
    })

    it("should scrape article", async () => {
      await sbmScraper.scrapeArticle("https://example.com")
      expect(page.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      )
      expect(page.$eval).toHaveBeenCalled()
      expect(page.$$eval).toHaveBeenCalled()
    })
  })

  describe("DirettaScraper", () => {
    let direttaScraper

    beforeEach(() => {
      direttaScraper = new DirettaScraper(browser)
    })

    it("should have correct categories", () => {
      expect(direttaScraper.categories).toBeInstanceOf(Array)
      expect(direttaScraper.categories.length).toBeGreaterThan(0)
    })

    it("should scrape article", async () => {
      await direttaScraper.scrapeArticle("https://example.com")
      expect(page.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      )
      expect(page.$eval).toHaveBeenCalled()
      expect(page.$$eval).toHaveBeenCalled()
    })
  })

  describe("CFScraper", () => {
    let cfScraper

    beforeEach(() => {
      cfScraper = new CFScraper(browser)
    })

    it("should scrape article", async () => {
      await cfScraper.scrapeArticle("https://example.com")
      expect(page.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      )
      expect(page.$eval).toHaveBeenCalled()
      expect(page.$$eval).toHaveBeenCalled()
    })
  })

  // describe("RUScraper", () => {
  //   let ruScraper

  //   beforeEach(() => {
  //     ruScraper = new RUScraper(browser)
  //   })

  //   it("should have correct categories", () => {
  //     expect(ruScraper.categories).toBeInstanceOf(Array)
  //     expect(ruScraper.categories.length).toBeGreaterThan(0)
  //   })

  //   it("should scrape article", async () => {
  //     // Mock page.$eval to return a valid date string
  //     page.$eval.mockImplementation((selector, callback) => {
  //       if (selector === ".article-datetime") {
  //         return "2024-01-01"
  //       }
  //       return "test"
  //     })

  //     await ruScraper.scrapeArticle("https://example.com")
  //     expect(page.goto).toHaveBeenCalledWith("https://example.com", expect.any(Object))
  //     expect(page.$eval).toHaveBeenCalled()
  //     expect(page.$$eval).toHaveBeenCalled()
  //   })
  // })

  describe("DSScraper", () => {
    let dsScraper

    beforeEach(() => {
      dsScraper = new DSScraper(browser)
    })

    it("should scrape article", async () => {
      await dsScraper.scrapeArticle("https://example.com")
      expect(page.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      )
      expect(page.$eval).toHaveBeenCalled()
      expect(page.$$eval).toHaveBeenCalled()
    })
  })

  describe("Utility Functions", () => {
    describe("createPromiseProducer", () => {
      it("should create a promise producer function", () => {
        const urls = ["url1", "url2"]
        const producer = createPromiseProducer(
          browser,
          urls,
          async (b, url) => url
        )
        const promise = producer()
        expect(promise).toBeDefined()
        expect(urls).toHaveLength(1)
      })

      it("should return null when no more URLs", () => {
        const urls = []
        const producer = createPromiseProducer(
          browser,
          urls,
          async (b, url) => url
        )
        const promise = producer()
        expect(promise).toBeNull()
      })
    })

    describe("runAllScrapers", () => {
      it("should run all scrapers", async () => {
        await runAllScrapers()
        expect(puppeteer.launch).toHaveBeenCalled()
        expect(browser.close).toHaveBeenCalled()
      })
    })
  })
})
