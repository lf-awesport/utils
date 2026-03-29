/**
 * @fileoverview Authentication Middleware
 * Validates sensitive requests such as secure webhook updates by checking for specific pre-shared secrets.
 * @module authMiddleware
 */
const crypto = require("crypto")
const { AppError } = require("../src/errors")
const { config } = require("../src/config")

/**
 * Express middleware to validate the update secret header against configured expectations.
 * Protects authorized routes to prevent unauthorized state manipulation.
 * 
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 * @param {import('express').NextFunction} next - Method to pass control to the next middleware.
 * @returns {void} Returns validation failure or passes control on.
 */
const validateUpdateSecret = (req, res, next) => {
  const providedSecret = req.headers["x-update-secret"]

  if (!config.updateSecret) {
    console.error("❌ UPDATE_SECRET not set in environment variables")
    return next(AppError.internal("Server misconfiguration"))
  }

  if (!providedSecret) {
    return next(AppError.unauthorized("Unauthorized: Missing secret"))
  }

  try {
    // Convert both secrets to buffers to run a timing-safe equality check
    // to prevent side-channel attacks during string comparison.
    const expectedBuffer = Buffer.from(config.updateSecret)
    const providedBuffer = Buffer.from(providedSecret)

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return next(AppError.unauthorized("Unauthorized: Invalid secret"))
    }
  } catch (error) {
    return next(AppError.unauthorized("Unauthorized: Invalid secret format"))
  }

  // Passing the middleware validation continues execution flow.
  next()
}

module.exports = { validateUpdateSecret }
