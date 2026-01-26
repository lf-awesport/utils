const { ZepClient } = require("@getzep/zep-cloud")
require("dotenv").config({ path: require("find-config")(".env") })

const zepClient = new ZepClient({
  apiKey: process.env.ZEP_API_KEY
})

module.exports = { zepClient }
