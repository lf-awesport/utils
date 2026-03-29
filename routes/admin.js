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
    const results = []

    // Phase 2: Backfill historical daily aggregates going back 30 days.
    for (let i = 30; i >= 2; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateString = d.toISOString().split("T")[0]

      // Skip backfilling if the daily summary is already generated.
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
    
    res.status(200).send(`✅ Update complete!\n${results.join("\n")}`)
  } catch (error) {
    // Forward unknown errors to the global error handler.
    next(error)
  }
})

module.exports = router
