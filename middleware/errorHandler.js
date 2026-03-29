/**
 * @fileoverview Global Error Handler Middleware
 * Intercepts all errors thrown natively or custom AppErrors during route execution.
 * @module errorHandler
 */
const { isAppError } = require("../src/errors")

/**
 * Standardizes the shape and response headers for any errors encountered.
 * Uses a typical Express 4-argument signature to be recognized as an error handler.
 * 
 * @param {Error} err - The error object intercepted from the request lifecycle.
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 * @param {import('express').NextFunction} next - Pass control to the next handler (unused here).
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500
  const code = err.code || "INTERNAL_ERROR"
  const message = err.message || "Internal server error"
  const details = err.details || null

  // Differentiate logging behavior based on application-level versus unknown server-level errors.
  if (isAppError(err)) {
    console.error("❌ App error:", { code, status, message, details })
  } else {
    console.error("❌ Server error:", err)
  }

  // Format and send the unified JSON error response.
  res.status(status).json({ error: { code, message, details } })
}

/**
 * Export the global error handler function.
 * @type {Function}
 */
module.exports = errorHandler
