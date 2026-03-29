/**
 * @fileoverview Serverless Entry Point
 * Wraps the standard Express application to run in a serverless environment (e.g., AWS Lambda, Vercel).
 */
const serverless = require("serverless-http")
const app = require("../server.js")

/**
 * Export the serverless-wrapped Express app to handle incoming HTTP requests.
 * @type {Function}
 */
module.exports = serverless(app)
