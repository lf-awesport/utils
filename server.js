const express = require("express")
const cors = require("cors")
require("dotenv").config({ path: require("find-config")(".env") })

// Import dependencies
const { processArticles, processDailyArticles } = require("./src/sentiment.js")
const { searchAndRerank } = require("./src/queryRAG.js")
const { chatbot } = require("./src/agents/chatbot.js")
const { runAllScrapers } = require("./src/scraper.js")
const { zepClient } = require("./src/zep.js")

// Configuration
const config = {
  port: process.env.PORT || 4000,
  maxQueryLength: 500
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
    const userId = req.body.userId
    const query = req.body.q
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Access-Control-Allow-Origin", "*")
    const pipeline = await chatbot({ userId })
    const result = await pipeline({ query })
    // Se result è già oggetto con text e sources, restituiscilo così com'è
    if (
      result &&
      typeof result === "object" &&
      "text" in result &&
      "sources" in result
    ) {
      res.json(result)
    } else {
      res.json({ text: result })
    }
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

    const results = await searchAndRerank(query, filters)

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

app.post("/users", async (req, res) => {
  try {
    const { userId, email, name } = req.body

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const user = await zepClient.user.add({
      userId,
      email,
      name: name || userId
    })

    res.json(user)
  } catch (error) {
    console.error("❌ Error registering Zep user:", error)
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
    // Calcola le date: dall'ultimo mese fino a due giorni fa
    const today = new Date()
    const results = []
    const firestore = require("./src/firebase.js").firestore

    for (let i = 30; i >= 2; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateString = d.toISOString().slice(0, 10)

      // Salta se già presente in daily
      const dailyDoc = await firestore
        .collection("daily")
        .doc(`daily-${dateString}`)
        .get()
      if (dailyDoc.exists) {
        results.push(`${dateString}: SKIPPED (already exists)`)
        continue
      }

      try {
        await processDailyArticles(dateString)
        results.push(`${dateString}: OK`)
      } catch (err) {
        results.push(`${dateString}: ERROR - ${err.message}`)
      }
    }
    res.status(200).send(`✅ Update complete!\n` + results.join("\n"))
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
