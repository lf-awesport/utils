const express = require("express")
const { searchAndRerank } = require("../src/search/queryRAG.js")
const { validateQuery } = require("../middleware/validators.js")

const router = express.Router()

router.post("/", validateQuery, async (req, res, next) => {
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
    next(error)
  }
})

module.exports = router
