const { perplexitySearchTool } = require("../tools/perplexityTool")
const { externalRAGTool } = require("../tools/externalRAGTool")
const {
  perplexityDbTool,
  normalizeArticle
} = require("../tools/perplexityDbTool")
const { mergeResultsTool } = require("../tools/mergeResultsTool")
const { gemini } = require("../services/gemini")
const {
  chatbotContextPrompt,
  chatbotSystemPrompt,
  conversationalContextPrompt,
  conversationalSystemPrompt
} = require("../prompts.js")
const { createContext } = require("../search/queryRAG")
const { zepClient } = require("../services/zep")
const { toolRouter } = require("./router")
const z = require("zod")

// Schema di output per Gemini (risposta testuale)
const outputSchema = z.object({
  content: z.string()
})

// Helper to safely initialize Zep user/thread
const ensureZepSession = async (userId, threadId) => {
  try {
    // 1. Ensure User exists
    await zepClient.user
      .add({ userId, email: `${userId}@example.com`, name: userId })
      .catch((e) => {
        // Ignore 400 (User already exists)
        if (e.statusCode === 400) return
        console.error("Zep user creation failed:")
      })
    // 2. Ensure Thread exists
    await zepClient.thread.create({ threadId, userId }).catch((e) => {
      // Ignore 400 (Thread already exists)
      if (e.statusCode === 400) return
      console.error("Zep thread creation failed:")
    })
  } catch (err) {
    console.error("Zep initialization warning:", err)
  }
}

async function chatbot({ userId }) {
  // Map userId to a persistent thread ID
  const threadId = userId ? `thread_${userId}` : null

  return async function pipeline({ query, onToken }) {
    // 0. Start Zep & Search in parallel
    const zepSetupPromise =
      userId && threadId
        ? ensureZepSession(userId, threadId)
        : Promise.resolve()

    // --- PHASE 1: RETRIEVE MEMORY ---
    let chatLog = ""
    let zepContextString = ""

    if (userId && threadId) {
      try {
        // Wrap Zep logic in a function to race against timeout
        const zepLogic = async () => {
          await zepSetupPromise
          // Fetch Context and Messages
          const [contextRes, messagesRes] = await Promise.all([
            zepClient.thread.getUserContext(threadId).catch((e) => {
              console.error("Zep getUserContext failed:", e)
              return null
            }),
            zepClient.thread.get(threadId, { limit: 10 }).catch((e) => {
              console.error("Zep get messages failed:", e)
              return null
            })
          ])

          if (messagesRes && messagesRes.messages) {
            chatLog = messagesRes.messages
              .map(
                (m) =>
                  `${
                    m.role === "user" || m.role === "human" ? "User" : "AI"
                  }: ${m.content}`
              )
              .join("\n")
          }

          if (contextRes && contextRes.context) {
            zepContextString = contextRes.context
          }
        }

        // Enforce 2s timeout on memory retrieval to prevent production hangs
        // ... same timeout logic ...
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Zep retrieval timed out (2s)")),
            2000
          )
        )

        await Promise.race([zepLogic(), timeoutPromise])
      } catch (error) {
        console.error("Failed to fetch Zep data (or timed out):", error)
      }
    }

    // --- PHASE 2: ROUTER DECISION ---
    const decision = await toolRouter({ query, history: chatLog })

    // --- PHASE 3: CONDITIONAL TOOL EXECUTION ---
    let ragResult = { docs: [] }
    let perplexityResult = { results: [] }
    let finalSystemPrompt = conversationalSystemPrompt
    let finalUserPrompt = ""
    const currentDate = new Date().toISOString().slice(0, 10)
    let ragDocs = []
    let perplexityDocs = []
    let mergedDocs = []

    // A. RAG MODE
    if (decision.tools.length > 0) {
      finalSystemPrompt = chatbotSystemPrompt

      const useRag = decision.tools.includes("rag")
      const usePerp = decision.tools.includes("perplexity")

      const promises = []
      if (useRag) promises.push(externalRAGTool.execute({ query }))
      else promises.push(Promise.resolve({ docs: [] }))

      if (usePerp) promises.push(perplexitySearchTool.execute({ query }))
      else promises.push(Promise.resolve({ results: [] }))

      const results = await Promise.all(promises)
      ragResult = results[0]
      perplexityResult = results[1]

      ragDocs = ragResult.docs || []
      perplexityDocs = (perplexityResult.results || [])
        .map(normalizeArticle)
        .map((a) => ({ data: a }))

      const mergeResult = await mergeResultsTool.execute({
        ragResults: ragDocs,
        perplexityResults: perplexityDocs
      })

      mergedDocs = mergeResult.merged || []
      const context = createContext(mergedDocs)

      finalUserPrompt = chatbotContextPrompt(
        query,
        context,
        currentDate,
        chatLog,
        zepContextString
      )
    }
    // B. CONVERSATIONAL MODE
    else {
      finalUserPrompt = conversationalContextPrompt(
        query,
        currentDate,
        chatLog,
        zepContextString
      )
    }

    // 3. Stream risposta con Gemini
    const answer = await gemini(
      finalUserPrompt,
      finalSystemPrompt,
      8192,
      outputSchema
    )

    // --- PARALLEL SAVING AND DOC PREP ---
    const ragUrls = new Set(ragDocs.map((d) => d.url))
    const newArticles = []
    for (const article of perplexityDocs) {
      if (article.data.url && !ragUrls.has(article.data.url)) {
        newArticles.push(article.data)
      }
    }

    const backgroundTasks = []

    // 1. Queue Zep Save
    if (userId && threadId) {
      const zepSavePromise = zepClient.thread
        .addMessages(threadId, {
          messages: [
            { role: "user", content: query },
            { role: "assistant", content: answer.content }
          ]
        })
        .catch((err) => console.error("Failed to save to Zep:", err))
      backgroundTasks.push(zepSavePromise)
    }

    // 2. Queue Article Save
    if (newArticles.length > 0) {
      const dbSavePromise = perplexityDbTool
        .execute({ articles: newArticles })
        .catch((err) => console.error("Background save error:", err))
      backgroundTasks.push(dbSavePromise)
    }

    // 3. DO NOT AWAIT HERE. Return the promise to the controller.
    // We group them into one promise to be handled by the caller.
    const savePromise = Promise.allSettled(backgroundTasks).then((results) => {
      results.forEach((res, i) => {
        if (res.status === "rejected")
          console.error(`Background task ${i} failed:`, res.reason)
      })
    })

    // ----------------------------------------
    // Includi anche le fonti (mergeResult.merged) in formato flat per il front-end
    let sources = []
    if (decision.tools.length > 0) {
      const allDocs =
        mergedDocs.length > 0
          ? mergedDocs.map((d) => d.data)
          : [...ragDocs, ...perplexityDocs.map((p) => p.data)]
      sources = allDocs.map((d, i) => ({
        url: d.url || "",
        title: `[${i + 1}]`,
        date: d.date || ""
      }))
      // REMOVED .slice(0, 10) to allow all sources
    }

    return {
      text: answer.content,
      sources,
      savePromise // Return this so the route handler can await it AFTER sending response
    }
  }
}

module.exports = { chatbot }
