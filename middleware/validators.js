const config = {
  maxQueryLength: 500
}

const validateQuery = (req, res, next) => {
  const query = req.body.q || req.body.query

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'query' in request body" })
  }

  if (query.length > config.maxQueryLength) {
    return res.status(400).json({
      error: `Query is too long. Maximum allowed length is ${config.maxQueryLength} characters.`
    })
  }

  next()
}

module.exports = { validateQuery, config }
