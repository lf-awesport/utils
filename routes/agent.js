/**
 * @fileoverview Agent Routes
 * Exposes internal AI chatbot endpoints to front-end HTTP clients using SSE (Server-Sent Events) streams.
 * @module agentRouter
 */
const express = require("express")
const rateLimit = require("express-rate-limit")
const { chatbot } = require("../src/agents/chatbot.js")
const { validateQuery } = require("../middleware/validators.js")

const router = express.Router()

/**
 * Basic rate limiting to mitigate spam or Denial-of-Service attacks.
 * Restricts individual IP chunks to a maximum of 20 requests per 15 mins.
 */
const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later." }
})

/**
 * POST /stream
 * Initiates an outgoing Server-Sent-Events (SSE) stream returning generated AI text chunks.
 * 
 * @name Agent Stream
 * @route {POST} /stream
 * @param {string} req.body.query - The user's input/chat query payload.
 */
router.post("/stream", agentLimiter, validateQuery, async (req, res) => {
  let closed = false
  
  // Track if client disconnects early to safely break generation loops.
  const onClose = () => {
    closed = true
  }
  req.on("close", onClose)

  try {
    const { query } = req.body

    // Configure headers for an indefinite SSE stream.
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    // Instruction to UI clients to attempt reconnects after 3s upon failure.
    res.write("retry: 3000\n\n")

    // Keeps the connection alive with empty ping events every 15 seconds.
    const ping = setInterval(() => {
      if (closed) {
        clearInterval(ping)
        return
      }
      res.write("event: ping\ndata: {}\n\n")
    }, 15000)

    // Helper ensuring stream writes abort logically if connection closed.
    const safeWrite = (payload) => {
      if (closed) return
      const ok = res.write(payload)
      if (!ok) res.once("drain", () => {})
    }

    // Await responses from the AI logic, streaming out tokens dynamically as they synthesize.
    const result = await chatbot({
      query,
      onToken: (token) =>
        safeWrite(`data: ${JSON.stringify({ text: token })}\n\n`)
    })

    // Output final definitive completion results or citations.
    if (result && !closed) {
      safeWrite(
        `data: ${JSON.stringify({ text: result.text, sources: result.sources || [], overwrite: true })}\n\n`
      )
    }

    // Gracefully communicate stream termination to the subscriber.
    if (!closed) {
      safeWrite("event: end\ndata: {}\n\n")
      res.end()
    }
  } catch (error) {
    if (!closed) {
      res.write("event: error\n")
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`)
      res.end()
    }
  } finally {
    // Cleanup active listener hooks to avoid memory leaks.
    req.off("close", onClose)
  }
})

module.exports = router
