const puppeteer = require("puppeteer")
const express = require("express")
const PDFDocument = require("pdfkit")
const { summarizeContent } = require("./summarize.js")
const cors = require("cors")
const { doc, setDoc, getDoc } = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")

const app = express()
app.use(cors())

app.get("/screenshot", async (req, res) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1980, height: 1980, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:3000/post/${req.query.id}`, {
    waitUntil: "networkidle0"
  })
  await page.waitForSelector("#carousel")

  var doc = new PDFDocument({
    size: [1080, 1080]
  })

  const ids = req.query.ids
  for (let i = 0; i < ids.length; i++) {
    const element = await page.$(`#${ids[i]}`)
    const img = await element.screenshot({ encoding: "binary" })
    doc.image(img, 0, 0, { width: 1080, height: 1080 })
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
      const postSnapshot = await getDoc(
        doc(firebaseApp, "calciofinanza", postId)
      )
      const post = postSnapshot.data()
      carousel = await summarizeContent(post.body)
      await setDoc(doc(firebaseApp, "carousels", postId), {
        id: postId,
        carousel,
        url: post.url,
        title: post.title
      })
      carousel = await getDoc(doc(firebaseApp, "carousels", postId))
    }
  } catch (error) {}
  res.json(carousel.data())
})

app.listen(4000)
