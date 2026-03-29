const crypto = require("crypto")
const { AppError } = require("../src/errors")
const { config } = require("../src/config")

const validateUpdateSecret = (req, res, next) => {
  const providedSecret = req.headers["x-update-secret"]

  if (!config.updateSecret) {
    console.error("❌ UPDATE_SECRET not set in environment variables")
    return next(AppError.internal("Server misconfiguration"))
  }

  if (!providedSecret) {
    return next(AppError.unauthorized("Unauthorized: Missing secret"))
  }

  try {
    const expectedBuffer = Buffer.from(config.updateSecret)
    const providedBuffer = Buffer.from(providedSecret)

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return next(AppError.unauthorized("Unauthorized: Invalid secret"))
    }
  } catch (error) {
    return next(AppError.unauthorized("Unauthorized: Invalid secret format"))
  }

  next()
}

module.exports = { validateUpdateSecret }
