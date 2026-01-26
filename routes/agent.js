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

router.post("/stream", agentLimiter, validateQuery, async (req, res) => {
  let closed = false
  const onClose = () => {
    closed = true
  }
  req.on("close", onClose)

  try {
    const userId = req.body.userId
    const query = req.body.q

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    res.write("retry: 3000\n\n")

    const ping = setInterval(() => {
      if (closed) return
      res.write("event: ping\ndata: {}\n\n")
    }, 15000)

    const safeWrite = (payload) => {
      if (closed) return
      const ok = res.write(payload)
      if (!ok) {
        res.once("drain", () => {})
      }
    }

    const pipeline = await chatbot({ userId })
    const result = await pipeline({
      query,
      onToken: (token) => {
        safeWrite(`data: ${JSON.stringify({ text: token })}\n\n`)
      }
    })

    if (result && !closed) {
      safeWrite(
        `data: ${JSON.stringify({
          text: result.text,
          sources: result.sources || [],
          overwrite: true
        })}\n\n`
      )
    }

    if (!closed) {
      safeWrite("event: end\ndata: {}\n\n")
      res.end()
    }
    clearInterval(ping)
  } catch (error) {
    if (!closed) {
      res.write("event: error\n")
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`)
      res.end()
    }
  } finally {
    req.off("close", onClose)
  }
})

module.exports = router
