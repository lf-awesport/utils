const express = require("express")
const cors = require("cors")
require("dotenv").config({ path: require("find-config")(".env") })

const { processArticles } = require("./src/sentiment.js")

const { queryRAG, searchSimilarDocuments } = require("./src/queryRAG.js")

const { runAllScrapers } = require("./src/scraper.js")

const app = express()
app.use(cors())
app.use(express.json())

app.post("/askAgent", async (req, res) => {
  const query = req.body.q

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'query' in request body" })
  }
  // Check if query length exceeds 500 characters (adjustable limit)
  if (query.length > 500) {
    return res.status(400).json({
      error: "Query is too long. Maximum allowed length is 500 characters."
    })
  }
  try {
    const answer = await queryRAG(query)
    res.json(answer)
  } catch (error) {
    console.error("❌ Error in /askAgent:", error)
    res.status(500).json({ error: error.message })
  }
})

app.post("/search", async (req, res) => {
  const { query, filters = [] } = req.body

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'query' in request body" })
  }

  // Check if query length exceeds 500 characters (adjustable limit)
  if (query.length > 500) {
    return res.status(400).json({
      error: "Query is too long. Maximum allowed length is 500 characters."
    })
  }

  try {
    // // 2. Valida ed elabora i filtri
    // const parsedFilters = Array.isArray(filters)
    //   ? filters
    //       .filter(
    //         (f) =>
    //           typeof f === "object" &&
    //           typeof f.field === "string" &&
    //           typeof f.op === "string" &&
    //           f.value !== undefined
    //       )
    //       .map((f) => ({
    //         field: f.field,
    //         op: f.op,
    //         value: f.value
    //       }))
    //   : []

    // 3. Esegui ricerca semantica
    const results = await searchSimilarDocuments({
      collectionName: "sentiment",
      query,
      distanceMeasure: "COSINE",
      limit: 5
      // filters: parsedFilters
    })

    // 4. Rimuovi campo analysis
    const sources = results.map(({ id, data }) => {
      const { analysis, ...rest } = data
      return { id, ...rest }
    })

    res.json({ sources })
  } catch (error) {
    console.error("❌ Error in /search:", error)
    res.status(500).json({ error: error.message })
  }
})

app.get("/update", async (req, res) => {
  if (!process.env.UPDATE_SECRET) {
    return res.status(401).send("🔒 Unauthorized: Invalid secret.")
  }

  try {
    await runAllScrapers()
    await processArticles()
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
