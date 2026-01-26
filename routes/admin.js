const express = require("express")
const { runAllScrapers } = require("../src/scrapers/scraper.js")
const {
  processArticles,
  processDailyArticles
} = require("../src/analysis/sentiment.js")
const { firestore } = require("../src/services/firebase.js")
const { validateUpdateSecret } = require("../middleware/auth.js")

const router = express.Router()

router.get("/update", validateUpdateSecret, async (req, res, next) => {
  try {
    await runAllScrapers()
    await processArticles()

    // Calcola le date: dall'ultimo mese fino a due giorni fa
    const today = new Date()
    const results = []

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
    next(error)
  }
})

module.exports = router
