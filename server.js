const express = require("express")
const cors = require("cors")
require("dotenv").config({ path: require("find-config")(".env") })

// Import dependencies
const { processArticles } = require("./src/sentiment.js")
const {
  queryRAG,
  searchSimilarDocuments,
  getDateRangeFilters
} = require("./src/queryRAG.js")
const { generateLearningModule } = require("./src/lesson.js")
const { runAllScrapers } = require("./src/scraper.js")

// Configuration
const config = {
  port: process.env.PORT || 4000,
  maxQueryLength: 500,
  search: {
    defaultLimit: 25,
    distanceMeasure: "COSINE",
    collectionName: "sentiment"
  }
}

// Input validation middleware
const validateQuery = (req, res, next) => {
  const query = req.body.q || req.body.query

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'query' in request body" })
  }

  if (query.length > config.maxQueryLength) {
    return res.status(400).json({
      error: `Query is too long. Maximum allowed length is ${config.maxQueryLength} characters.`
    })
  }

  next()
}

const validateModuleRequest = (req, res, next) => {
  const { topic, materia, lessonId } = req.body

  if (!topic || !materia || !lessonId) {
    return res.status(400).json({
      error: "Missing required fields: 'topic', 'materia', 'lessonId'"
    })
  }

  next()
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error("❌ Server error:", err)
  res.status(500).json({ error: "Internal server error" })
}

// Initialize Express app
const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.post("/askAgent", validateQuery, async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("Access-Control-Allow-Origin", "*")
    for await (const chunk of await queryRAG(req.body.q, { stream: true })) {
      if (chunk.sources) {
        res.write(`data: ${JSON.stringify({ sources: chunk.sources })}\n\n`)
      } else {
        let text =
          chunk.text || chunk.answer || (typeof chunk === "string" ? chunk : "")
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }
    res.end()
  } catch (error) {
    console.error("❌ Error in /askAgent:", error)
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    res.end()
  }
})

app.post("/search", validateQuery, async (req, res) => {
  try {
    const { query, fromYear, fromMonth, fromDay, toYear, toMonth, toDay } =
      req.body

    function formatDate(y, m, d) {
      if (!y || !m || !d) return null
      return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`
    }

    const filters = []
    const fromDate = formatDate(fromYear, fromMonth, fromDay)
    const toDate = formatDate(toYear, toMonth, toDay)

    if (fromDate) filters.push({ field: "date", op: ">=", value: fromDate })
    if (toDate) filters.push({ field: "date", op: "<=", value: toDate })

    const results = await searchSimilarDocuments({
      collectionName: config.search.collectionName,
      query,
      distanceMeasure: config.search.distanceMeasure,
      limit: config.search.defaultLimit,
      filters
    })

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

app.post("/generateModule", validateModuleRequest, async (req, res) => {
  try {
    const { topic, materia, lessonId } = req.body
    const result = await generateLearningModule({ topic, materia, lessonId })

    if (!result) {
      return res.status(500).json({ error: "Failed to generate module" })
    }

    res.status(200).json({
      message: `✅ Module '${lessonId}' created under '${materia}'`,
      cards: result
    })
  } catch (error) {
    console.error("❌ Error in /generateModule:", error)
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

app.get("/test", (req, res) => {
  console.log("✅ Test endpoint hit at", new Date().toISOString())
  res.send("✅ Server is running correctly!")
})

// Apply error handling middleware
app.use(errorHandler)

// Start server
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`)
  })
}

module.exports = app
