/**
 * @fileoverview Application Configuration
 * Centralized environment variable management. Parses `.env` variables into typed config objects.
 * @module config
 */
const path = require("path")
const findConfig = require("find-config")
const dotenv = require("dotenv")

/**
 * Automatically locate and load the closest .env file climbing up project directories.
 */
dotenv.config({
  path: findConfig(".env") || path.resolve(process.cwd(), ".env")
})

/**
 * Standardized configuration map decoupling process.env from internal code logics.
 * Replaces backslash newlines in keys to ensure cryptographic credentials load correctly.
 * @type {Object}
 */
const config = {
  projectId: process.env.PROJECT_ID,
  location: process.env.LOCATION,
  model: process.env.MODEL,
  embeddingModel: process.env.EMBEDDING_MODEL,
  clientEmail: process.env.CLIENT_EMAIL,
  privateKey: process.env.PRIVATE_KEY?.replace(/\\n/g, "\n"),
  googleCredentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  zepApiKey: process.env.ZEP_API_KEY,
  firebase: {
    projectId: process.env.FB_PROJECT_ID,
    clientEmail: process.env.FB_CLIENT_EMAIL,
    privateKey: process.env.FB_PRIVATE_KEY?.replace(/\\n/g, "\n")
  },
  updateSecret: process.env.UPDATE_SECRET,
  googleGenerativeAiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  validation: {
    maxQueryLength: 2000
  }
}

/**
 * Validates the presence of strictly required environment configurations.
 * 
 * @param {Array<string>} keys - Array of strings matching key names in process.env.
 * @param {Function} [errorFactory] - Optional callback to wrap thrown error objects cleanly.
 * @throws {Error} Terminates application flows if minimum configs are missing.
 */
const requireEnv = (keys, errorFactory = (msg) => new Error(msg)) => {
  const missing = keys.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw errorFactory(
      `Missing required environment variables: ${missing.join(", ")}`
    )
  }
}

module.exports = {
  config,
  requireEnv
}
