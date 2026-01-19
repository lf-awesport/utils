const { perplexitySearchTool } = require("../tools/perplexityTool")
const { externalRAGTool } = require("../tools/externalRAGTool")
const {
  perplexityDbTool,
  normalizeArticle
} = require("../tools/perplexityDbTool")
const { mergeResultsTool } = require("../tools/mergeResultsTool")
const { gemini } = require("../gemini")
const {
  chatbotContextPrompt,
  chatbotSystemPrompt,
  conversationalContextPrompt,
  conversationalSystemPrompt
} = require("../prompts.js")
const { createContext } = require("../queryRAG")
const { zepClient } = require("../zep")
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
      .catch(() => {})
    // 2. Ensure Thread exists
    await zepClient.thread.create({ threadId, userId }).catch(() => {})
  } catch (err) {
    console.error("Zep initialization warning:", err.message)
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
    let fullHistory = ""
    let chatLog = ""
    let zepContextBlock = ""

    if (userId && threadId) {
      try {
        await zepSetupPromise
        // Fetch Context and Messages
        const [contextRes, messagesRes] = await Promise.all([
          zepClient.thread.getUserContext(threadId).catch((e) => null),
          zepClient.thread.get(threadId, { limit: 10 }).catch((e) => null)
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
          zepContextBlock = `\n\n## 🧠 LONG TERM MEMORY (User Facts):\n${contextRes.context}`
        }

        fullHistory = chatLog + zepContextBlock
      } catch (error) {
        console.error("Failed to fetch Zep data:", error.message)
      }
    }

    // --- PHASE 2: ROUTER DECISION ---
    const decision = await toolRouter({ query, history: chatLog })
    console.log("🤖 Router Decision:", JSON.stringify(decision))

    // --- PHASE 3: CONDITIONAL TOOL EXECUTION ---
    let ragResult = { docs: [] }
    let perplexityResult = { results: [] }
    let finalSystemPrompt = conversationalSystemPrompt
    let finalUserPrompt = ""
    const currentDate = new Date().toISOString().slice(0, 10)

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

      const ragDocs = ragResult.docs || []
      const perplexityDocs = (perplexityResult.results || [])
        .map(normalizeArticle)
        .map((a) => ({ data: a }))

      const mergeResult = await mergeResultsTool.execute({
        ragResults: ragDocs,
        perplexityResults: perplexityDocs
      })

      const context = createContext(mergeResult.merged || [])

      finalUserPrompt = chatbotContextPrompt(
        query,
        context,
        currentDate,
        fullHistory
      )
    }
    // B. CONVERSATIONAL MODE
    else {
      finalUserPrompt = conversationalContextPrompt(
        query,
        currentDate,
        fullHistory
      )
    }

    // 3. Stream risposta con Gemini
    const answer = await gemini(
      finalUserPrompt,
      finalSystemPrompt,
      8192,
      outputSchema
    )

    // --- ZEP MEMORY SAVING ---
    if (userId && threadId) {
      // Fire and forget (don't await strictly if you want speed)
      zepClient.thread
        .addMessages(threadId, {
          messages: [
            { role: "user", content: query },
            { role: "assistant", content: answer.content }
          ]
        })
        .catch((err) => console.error("Failed to save to Zep:", err.message))
    }
    // -------------------------

    // Dopo la risposta, salva i nuovi articoli
    const ragDocs = ragResult.docs || []
    const perplexityDocs = (perplexityResult.results || [])
      .map(normalizeArticle)
      .map((a) => ({ data: a }))

    const ragUrls = new Set(ragDocs.map((d) => d.url))
    // Estrai gli articoli normalizzati da {data: ...}
    const newArticles = []
    for (const article of perplexityDocs) {
      if (article.data.url && !ragUrls.has(article.data.url)) {
        newArticles.push(article.data)
      }
    }
    if (newArticles.length > 0) {
      // Fire-and-forget: salva in background senza bloccare la risposta
      perplexityDbTool
        .execute({ articles: newArticles })
        .catch((err) => console.error("Background save error:", err))
    }
    // Includi anche le fonti (mergeResult.merged) in formato flat per il front-end
    let sources = []
    if (decision.tools.length > 0) {
      // Need to re-merge or just use what we have available
      // The mergeResult was defined inside the IF previously, now it's out of scope or we need to access it
      // Let's re-run merge or just map directly from what we have since we can't easily hoist the complex merge object
      // Actually, let's just create a quick source list
      const allDocs = [...ragDocs, ...perplexityDocs.map((p) => p.data)]
      sources = allDocs
        .map((d, i) => ({
          url: d.url || "",
          title: `[${i + 1}]`,
          date: d.date || ""
        }))
        .slice(0, 10) // Limit sources
    }

    return {
      text: answer.content,
      sources
    }
  }
}

module.exports = { chatbot }
