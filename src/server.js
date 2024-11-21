const puppeteer = require("puppeteer")
const express = require("express")
const PDFDocument = require("pdfkit")
const { summarizeContent } = require("./summarize.js")
const {
  summarizePrompt,
  dailySummaryPrompt,
  sentimentAnalysisPrompt,
  highlightPrompt
} = require("./prompts")
const { cfScraper } = require("./cf-scraper.js")
const { dsScraper } = require("./ds-scraper.js")
const { ruScraper } = require("./ru-scraper.js")
const cors = require("cors")
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc
} = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")

const app = express()
app.use(cors())

app.get("/screenshot", async (req, res) => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)
  await page.setViewport({ width: 1980, height: 1980, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:3000/post/${req.query.id}`, {
    waitUntil: "networkidle2"
  })

  await page.waitForSelector("#linkedin")
  await page.$eval("#linkedin", (element) => element.click())
  await page.waitForSelector("#carousel")

  var doc = new PDFDocument({
    size: [1080, 1350]
  })

  const ids = req.query.ids
  for (let i = 0; i < ids.length; i++) {
    const element = await page.$(`#${ids[i]}`)
    const img = await element.screenshot({ encoding: "binary" })
    doc.image(img, 0, 0, { width: 1080, height: 1350 })
    if (i <= ids.length - 2) {
      doc.addPage()
    }
  }

  // Set some headers
  res.statusCode = 200
  res.setHeader("Content-type", "application/pdf")
  res.setHeader("Access-Control-Allow-Origin", "*")

  // Header to force download
  res.setHeader(
    "Content-disposition",
    `attachment; filename=${req.query.id}.pdf`
  )

  doc.pipe(res)
  doc.end()
  await browser.close()
})

app.get("/getCarousel", async (req, res) => {
  const postId = req.query.id
  let carousel
  try {
    carousel = await getDoc(doc(firebaseApp, "carousels", postId))
    if (!carousel.data()) {
      const postSnapshot = await getDoc(doc(firebaseApp, "posts", postId))
      const post = postSnapshot.data()
      carousel = await summarizeContent(post.body, summarizePrompt)

      await setDoc(doc(firebaseApp, "carousels", postId), {
        id: postId,
        carousel,
        url: post.url,
        title: post.title
      })
      carousel = await getDoc(doc(firebaseApp, "carousels", postId))
    }
  } catch (error) {
    console.log(error)
  }
  res.json(carousel.data())
  res.end()
})

app.get("/generateHighlights", async (req, res) => {
  const postId = req.query.id
  let highlights
  try {
    const carousel = await getDoc(doc(firebaseApp, "carousels", postId))
    let text = ""
    carousel.data().carousel.forEach((e) => (text = text.concat(e.content)))
    highlights = await summarizeContent(text, highlightPrompt)
    await setDoc(doc(firebaseApp, "highlights", postId), {
      id: postId,
      highlights: highlights.highlights
    })
    highlights = await getDoc(doc(firebaseApp, "highlights", postId))
  } catch (error) {
    console.log(error)
  }
  res.json(highlights.data())
  res.end()
})

app.get("/getDailySummary", async (req, res) => {
  const date = req.query.date
  let urls = []
  let ids = []
  let dailySummary
  try {
    dailySummary = await getDoc(doc(firebaseApp, "daily", date))
    if (!dailySummary.data()) {
      let body = "Daily news of " + date
      const dailyQuery = query(
        collection(firebaseApp, "posts"),
        where("date", "==", date)
      )
      const snapshot = await getDocs(dailyQuery)
      snapshot.forEach((doc) => {
        if (doc.data().date.includes(date)) {
          body = body.concat(doc.data().body)
          urls.push(doc.data().url)
          ids.push(doc.id)
        }
      })
      if (urls.length > 0) {
        dailySummary = await summarizeContent(body, dailySummaryPrompt)

        await setDoc(doc(firebaseApp, "daily", date), {
          id: date,
          body: dailySummary,
          urls,
          ids,
          title: `Daily Summary ${date}`
        })
        dailySummary = await getDoc(doc(firebaseApp, "daily", date))
      }
    }
  } catch (error) {
    console.log(error)
  }
  if (dailySummary.data()) {
    return res.json(dailySummary.data())
  } else {
    res.json()
    res.end()
  }
})

app.get("/scrapePosts", async (req, res) => {
  try {
    await cfScraper()
    await ruScraper()
    await dsScraper()
  } catch (error) {
    console.log(error)
  }
  res.status(200)
  res.end()
})

app.get("/getSentimentAnalysis", async (req, res) => {
  const postId = req.query.id
  const table = req.query.table || "sentiment"
  let analysis
  try {
    analysis = await getDoc(doc(firebaseApp, table, postId))
    if (!analysis.data()) {
      const postSnapshot = await getDoc(doc(firebaseApp, "posts", postId))
      const post = postSnapshot.data()
      analysis = await summarizeContent(post.body, sentimentAnalysisPrompt)
      await setDoc(doc(firebaseApp, table, postId), {
        id: postId,
        analysis,
        prejudice: analysis?.rilevazione_di_pregiudizio?.grado_di_pregiudizio,
        readability: analysis?.analisi_leggibilità?.punteggio_flesch_kincaid,
        tags: analysis?.tags,
        url: post.url,
        excerpt: post.excerpt,
        imgLink: post.imgLink,
        title: post.title,
        date: post.date,
        author: post.author
      })
      analysis = await getDoc(doc(firebaseApp, table, postId))
    }
  } catch (error) {
    console.log(error)
  }
  res.json(analysis?.data())
  res.end()
})

app.listen(4000)
