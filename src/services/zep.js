const { ZepClient } = require("@getzep/zep-cloud")
const { config } = require("../config")

const zepClient = new ZepClient({
  apiKey: config.zepApiKey
})

module.exports = { zepClient }
