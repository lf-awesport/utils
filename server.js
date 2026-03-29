/**
 * @fileoverview Main Express Server Application
 * Configures and initializes the Express server, middleware, and routes.
 * @module server
 */
const express = require("express")
const cors = require("cors")
require("dotenv").config({ path: require("find-config")(".env") })

const errorHandler = require("./middleware/errorHandler.js")
const agentRouter = require("./routes/agent.js")
const searchRouter = require("./routes/search.js")
const adminRouter = require("./routes/admin.js")

/**
 * Server configuration object mapping expected environment variables or defaults.
 * @type {Object}
 * @property {number|string} port - The port the server will listen on.
 */
const config = {
  port: process.env.PORT || 4000
}

/**
 * Initialize the Express application instance.
 * @type {import('express').Application}
 */
const app = express()

/**
 * Trust the first proxy to ensure accurately reading client IPs on platforms like Vercel.
 */
app.set("trust proxy", 1)

/**
 * Apply global middleware.
 * - cors(): Opens up the API to cross-origin requests.
 * - express.json(): Automatically parses incoming JSON body payloads.
 */
app.use(cors())
app.use(express.json())

/**
 * Register primary application routers.
 */
app.use("/askAgent", agentRouter)
app.use("/search", searchRouter)
app.use("/", adminRouter) // Contains /update

/**
 * Standard test endpoint to verify the server is active.
 * 
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 */
app.get("/test", (req, res) => {
  console.log("✅ Test endpoint hit at", new Date().toISOString())
  res.send("✅ Server is running correctly!")
})

/**
 * Apply the global error handling middleware last to catch route exceptions.
 */
app.use(errorHandler)

/**
 * Start listening for incoming traffic on the configured port.
 * This block executes only when the file is run directly (not when imported as a module).
 */
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`)
  })
}

module.exports = app
