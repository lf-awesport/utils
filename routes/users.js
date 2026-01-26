const express = require("express")
const { zepClient } = require("../src/services/zep.js")
const { AppError } = require("../src/errors")

const router = express.Router()

router.post("/", async (req, res, next) => {
  try {
    const { userId, email, name } = req.body

    if (!userId || !email) {
      return next(AppError.badRequest("Missing required fields"))
    }

    const user = await zepClient.user.add({
      userId,
      email,
      name: name || userId
    })

    res.json(user)
  } catch (error) {
    next(error)
  }
})

module.exports = router
