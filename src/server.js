const puppeteer = require("puppeteer")
const express = require("express")
const PDFDocument = require("pdfkit")
const fs = require("fs")

const app = express()

app.get("/screenshot", async (req, res) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1980, height: 1980, deviceScaleFactor: 2 })
  await page.goto(req.query.url) // URL is given by the "user" (your client-side application)
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
  // doc.pipe(fs.createWriteStream("file.pdf"))
  doc.end()
  await browser.close()
})

app.listen(4000)
