const { ZepClient } = require("@getzep/zep-cloud")
const { config } = require("../config")

const zepClient = new ZepClient({
  apiKey: config.zepApiKey
})

const ensureZepSession = async (userId, threadId) => {
  try {
    await zepClient.user
      .add({ userId, email: `${userId}@example.com`, name: userId })
      .catch((e) => {
        if (e.statusCode === 400) return
      })
    await zepClient.thread.create({ threadId, userId }).catch((e) => {
      if (e.statusCode === 400) return
    })
  } catch (err) {}
}

const fetchZepMemory = async ({ userId, threadId, zepSetupPromise, limit }) => {
  let chatLog = ""
  let zepContextString = ""

  if (!userId || !threadId) {
    return { chatLog, zepContextString }
  }

  const [contextRes, messagesRes] = await Promise.all([
    zepClient.thread.getUserContext(threadId).catch((e) => {
      return null
    }),
    zepClient.thread.get(threadId, { limit }).catch((e) => {
      return null
    })
  ])

  if (messagesRes && messagesRes.messages) {
    chatLog = messagesRes.messages
      .map(
        (m) =>
          `${m.role === "user" || m.role === "human" ? "User" : "AI"}: ${
            m.content
          }`
      )
      .join("\n")
  }

  if (contextRes && contextRes.context) {
    zepContextString = contextRes.context
  }

  return { chatLog, zepContextString }
}

module.exports = { zepClient, ensureZepSession, fetchZepMemory }
