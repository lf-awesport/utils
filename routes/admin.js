/**
 * @fileoverview Admin Routes
 * Handles scheduled administrative tasks such as triggering the daily scrapers and backfilling dates.
 * @module adminRouter
 */
const express = require("express")
const { runAllScrapers } = require("../src/scrapers/scraper.js")
const {
  processArticles,
  processDailyArticles
} = require("../src/generation/sentiment.js")
const { firestore } = require("../src/services/firebase.js")
const { validateUpdateSecret } = require("../middleware/auth.js")

const router = express.Router()

/**
 * GET /update
 * Secure endpoint that triggers the web scraper data pipeline.
 * It fetches the newest articles, synthesizes them, and backfills missing daily reports.
 *
 * @name Update Pipeline
 * @route {GET} /update
 * @authentication Requires valid x-update-secret header.
 */
router.get("/update", validateUpdateSecret, async (req, res, next) => {
  try {
    // Phase 1: Collect new raw data and initiate processing.
    await runAllScrapers()
    await processArticles()

    const today = new Date()
    const d = new Date(today)
    d.setDate(today.getDate() - 1)
    const dateString = d.toISOString().split("T")[0]

    try {
      await processDailyArticles(dateString)
    } catch (err) {
      console.error(
        `Error processing daily articles for ${dateString}:`,
        err.message
      )
    }

    res.status(200).send(`✅ Update complete for ${dateString}!`)
  } catch (error) {
    // Forward unknown errors to the global error handler.
    next(error)
  }
})

module.exports = router
