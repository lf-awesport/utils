/**
 * @fileoverview Search Routes
 * Provides a dedicated semantic search endpoint yielding AI-reranked document matches.
 * @module searchRouter
 */
const express = require("express")
const { searchAndRerank } = require("../src/retrieval/queryRAG.js")
const { validateQuery } = require("../middleware/validators.js")

const router = express.Router()

/**
 * Normalizes disjointed year, month, and day integers into a valid ISO date string format ('YYYY-MM-DD').
 * Helper utility primarily for ensuring precise indexing comparison against database entities.
 * 
 * @param {number|string} y - The 4-digit year.
 * @param {number|string} m - The 1 or 2-digit month.
 * @param {number|string} d - The 1 or 2-digit day.
 * @returns {string|null} Format "YYYY-MM-DD" or null if any bounds are entirely missing.
 */
const formatDate = (y, m, d) => {
  if (!y || !m || !d) return null
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`
}

/**
 * POST /
 * Queries the underlying RAG vector systems searching for contextually relevant source documents.
 * Enables date bounding logic filtering over results.
 * 
 * @name Semantic Search
 * @route {POST} /
 * @param {string} req.body.query - Assumes the validated semantic search string.
 * @param {number} [req.body.fromYear] - Start bounds for search date range filtering.
 */
router.post("/", validateQuery, async (req, res, next) => {
  try {
    const { query, fromYear, fromMonth, fromDay, toYear, toMonth, toDay } =
      req.body

    const filters = []
    
    // Evaluate if valid date windows are supplied, applying them for Firestore.
    const fromDate = formatDate(fromYear, fromMonth, fromDay)
    const toDate = formatDate(toYear, toMonth, toDay)

    if (fromDate) filters.push({ field: "date", op: ">=", value: fromDate })
    if (toDate) filters.push({ field: "date", op: "<=", value: toDate })

    // Execute core vector search returning unified objects with `id` and `data` structures.
    const results = await searchAndRerank(query, filters)

    // Strip out overly heavy analytical payload tags before remitting responses directly back to the front-end client.
    const sources = results.map(({ id, data }) => {
      const { analysis, ...rest } = data
      return { id, ...rest }
    })

    res.json({ sources })
  } catch (error) {
    // Escalate processing failures gracefully ensuring proper JSON structured error codes.
    next(error)
  }
})

module.exports = router
