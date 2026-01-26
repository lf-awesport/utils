const path = require("path")
const findConfig = require("find-config")
const dotenv = require("dotenv")

// Load environment once for the entire backend
dotenv.config({
  path: findConfig(".env") || path.resolve(process.cwd(), ".env")
})

const config = {
  projectId: process.env.PROJECT_ID,
  location: process.env.LOCATION,
  model: process.env.MODEL,
  embeddingModel: process.env.EMBEDDING_MODEL,
  clientEmail: process.env.CLIENT_EMAIL,
  privateKey: process.env.PRIVATE_KEY,
  googleCredentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  zepApiKey: process.env.ZEP_API_KEY,
  firebase: {
    projectId: process.env.FB_PROJECT_ID,
    clientEmail: process.env.FB_CLIENT_EMAIL,
    privateKey: process.env.FB_PRIVATE_KEY
  },
  updateSecret: process.env.UPDATE_SECRET,
  googleGenerativeAiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

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
