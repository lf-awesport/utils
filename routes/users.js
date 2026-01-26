const express = require("express")
const { zepClient } = require("../src/zep.js")

const router = express.Router()

router.post("/", async (req, res, next) => {
  try {
    const { userId, email, name } = req.body

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing required fields" })
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
