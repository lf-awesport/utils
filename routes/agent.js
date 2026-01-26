const express = require("express")
const rateLimit = require("express-rate-limit")
const { chatbot } = require("../src/agents/chatbot.js")
const { validateQuery } = require("../middleware/validators.js")

const router = express.Router()

// Rate limiter for agent
// Allow 20 requests per 15 minutes per IP
const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later." }
})

router.post("/", agentLimiter, validateQuery, async (req, res, next) => {
  try {
    const userId = req.body.userId
    const query = req.body.q

    // These headers are usually handled by CORS middleware, but keeping for safety if consistent with previous
    // res.setHeader("Access-Control-Allow-Origin", "*")
    // Express res.json automaticall sets Content-Type

    const pipeline = await chatbot({ userId })
    const result = await pipeline({ query })

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
    next(error)
  }
})

module.exports = router
