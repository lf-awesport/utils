const validateUpdateSecret = (req, res, next) => {
  const providedSecret = req.headers["x-update-secret"]

  if (!process.env.UPDATE_SECRET) {
    console.error("❌ UDPATE_SECRET not set in environment variables")
    return res.status(500).json({ error: "Server misconfiguration" })
  }

  if (providedSecret !== process.env.UPDATE_SECRET) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing secret" })
  }

  next()
}

module.exports = { validateUpdateSecret }
