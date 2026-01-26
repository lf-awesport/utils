const { isAppError } = require("../src/errors")

const errorHandler = (err, req, res, next) => {
  const status = err.status || 500
  const code = err.code || "INTERNAL_ERROR"
  const message = err.message || "Internal server error"
  const details = err.details || null

  if (isAppError(err)) {
    console.error("❌ App error:", { code, status, message, details })
  } else {
    console.error("❌ Server error:", err)
  }

  res.status(status).json({ error: { code, message, details } })
}

module.exports = errorHandler
