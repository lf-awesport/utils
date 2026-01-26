const { AppError } = require("../src/errors")
const { config } = require("../src/config")

const validateUpdateSecret = (req, res, next) => {
  const providedSecret = req.headers["x-update-secret"]

  if (!config.updateSecret) {
    console.error("❌ UPDATE_SECRET not set in environment variables")
    return next(AppError.internal("Server misconfiguration"))
  }

  if (providedSecret !== config.updateSecret) {
    return next(AppError.unauthorized("Unauthorized: Invalid or missing secret"))
  }

  next()
}

module.exports = { validateUpdateSecret }
