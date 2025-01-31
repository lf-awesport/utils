const serverless = require("serverless-http")
const app = require("../src/server.js") // Importa l'app dal file in /src

module.exports = serverless(app)
