/**
 * @fileoverview Input Validators
 * Specialized middleware ensuring incoming API requests contain valid configuration payloads.
 * @module validators
 */
const { AppError } = require("../src/errors")
const { config } = require("../src/config")

/**
 * Validates search string payloads submitted to chat or query endpoints limit potential vulnerabilities.
 * Normalizes input keys and ensures valid string bounds limits.
 * 
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 * @param {import('express').NextFunction} next - Method to pass control to the next middleware.
 * @returns {void}
 */
const validateQuery = (req, res, next) => {
  // Support both 'q' or 'query' parameters for flexible client interfacing.
  const query = req.body.q || req.body.query

  // Ensure string typing avoiding injection of invalid types (e.g. nested objects).
  if (!query || typeof query !== "string") {
    return next(
      AppError.badRequest("Missing or invalid 'query' in request body")
    )
  }

  // Ensure the query adheres to maximum bounds for resource protection.
  if (query.length > config.validation.maxQueryLength) {
    return next(
      AppError.badRequest(
        `Query is too long. Maximum allowed length is ${config.validation.maxQueryLength} characters.`
      )
    )
  }

  // Normalize the query variable for downstream route consistency.
  req.body.query = query
  next()
}

module.exports = { validateQuery }
