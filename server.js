const express = require("express")
const cors = require("cors")

const {
  processArticles,
  batchUpdateRecommendations
} = require("./embeddings.js")

const { queryRAG } = require("./queryRAG.js")

const { unifiedScraper } = require("./scraper.js")

const app = express()
app.use(cors())
app.use(express.json())

app.post("/askAgent", async (req, res) => {
  const question = req.body.q
  if (!question)
    return res.status(400).json({ error: "Missing query param `q`" })
  try {
    const answer = await queryRAG(question)
    res.json(answer)
  } catch (error) {
    console.error("❌ Error in /askAgent:", error)
    res.status(500).json({ error: error.message })
  }
})

// 📦 Aggiorna articoli (scraping + analisi + embeddings)
app.get("/update", async (req, res) => {
  try {
    await unifiedScraper()
    await processArticles()
    // await batchUpdateRecommendations()
    res.status(200).send("✅ Update complete!")
  } catch (error) {
    console.error("❌ Error during update:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🧪 Test endpoint
app.get("/test", (req, res) => {
  console.log("✅ Test endpoint hit at", new Date().toISOString())
  res.send("✅ Server is running correctly!")
})

// 🚀 Avvio locale o export per Vercel
if (require.main === module) {
  app.listen(4000, () => {
    console.log("Server listening on port 4000")
  })
}

module.exports = app
