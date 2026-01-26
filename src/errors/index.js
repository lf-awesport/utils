class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", details = null } = {}) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message = "Bad request", details = null) {
    return new AppError(message, { status: 400, code: "BAD_REQUEST", details })
  }

  static unauthorized(message = "Unauthorized", details = null) {
    return new AppError(message, { status: 401, code: "UNAUTHORIZED", details })
  }

  static forbidden(message = "Forbidden", details = null) {
    return new AppError(message, { status: 403, code: "FORBIDDEN", details })
  }

  static notFound(message = "Not found", details = null) {
    return new AppError(message, { status: 404, code: "NOT_FOUND", details })
  }

  static externalService(message = "External service error", details = null) {
    return new AppError(message, { status: 502, code: "EXTERNAL_SERVICE_ERROR", details })
  }

  static internal(message = "Internal server error", details = null) {
    return new AppError(message, { status: 500, code: "INTERNAL_ERROR", details })
  }
}

const isAppError = (err) => err && err.name === "AppError"

module.exports = {
  AppError,
  isAppError
}
