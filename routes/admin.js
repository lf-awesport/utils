/**
 * @fileoverview Admin Routes
 * Handles scheduled administrative tasks such as triggering the daily scrapers and backfilling dates.
 * @module adminRouter
 */
const express = require("express")
const { runAllScrapers } = require("../src/scrapers/scraper.js")
const { processArticles } = require("../src/generation/sentiment.js")
const { backfillDailyLessons } = require("../src/generation/lesson.js")
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
    console.log("here")
    await runAllScrapers()
    await processArticles()
    await backfillDailyLessons()
    res.status(200).send(`✅ Update complete`)
  } catch (error) {
    // Forward unknown errors to the global error handler.
    next(error)
  }
})

module.exports = router
