const express = require("express")
const cors = require("cors")
require("dotenv").config({ path: require("find-config")(".env") })

const errorHandler = require("./middleware/errorHandler.js")
const agentRouter = require("./routes/agent.js")
const searchRouter = require("./routes/search.js")
const usersRouter = require("./routes/users.js")
const adminRouter = require("./routes/admin.js")

// Configuration
const config = {
  port: process.env.PORT || 4000
}

// Initialize Express app
const app = express()

// Trust proxy is required for Vercel/proxies to ensuring accurate rate limiting
app.set("trust proxy", 1)

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use("/askAgent", agentRouter)
app.use("/search", searchRouter)
app.use("/users", usersRouter)
app.use("/", adminRouter) // Contains /update

app.get("/test", (req, res) => {
  console.log("✅ Test endpoint hit at", new Date().toISOString())
  res.send("✅ Server is running correctly!")
})

// Apply error handling middleware
app.use(errorHandler)

// Start server
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`)
  })
}

module.exports = app
