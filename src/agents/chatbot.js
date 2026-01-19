const { perplexitySearchTool } = require("../tools/perplexityTool")
const { externalRAGTool } = require("../tools/externalRAGTool")
const {
  perplexityDbTool,
  normalizeArticle
} = require("../tools/perplexityDbTool")
const { mergeResultsTool } = require("../tools/mergeResultsTool")
const { gemini } = require("../gemini")
const { chatbotContextPrompt, chatbotSystemPrompt } = require("../prompts.js")
const { createContext } = require("../queryRAG")
const { zepClient } = require("../zep")
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

    // 1. RAG e Perplexity in parallelo

    const [ragResult, perplexityResult] = await Promise.all([
      externalRAGTool.execute({ query }),
      perplexitySearchTool.execute({ query })
    ])
    const ragDocs = ragResult.docs || []
    // Normalizza i risultati Perplexity e wrappa in {data: ...} per compatibilità
    const perplexityDocs = (perplexityResult.results || [])
      .map(normalizeArticle)
      .map((a) => ({ data: a }))

    // 2. Merge e deduplica
    const mergeResult = await mergeResultsTool.execute({
      ragResults: ragDocs,
      perplexityResults: perplexityDocs
    })

    // Usa createContext per generare il contesto finale (tutti i doc ora hanno .data)
    const context = createContext(mergeResult.merged || [])

    // --- ZEP MEMORY RETRIEVAL ---
    let fullHistory = ""

    if (userId && threadId) {
      try {
        await zepSetupPromise

        // Fetch Context and Messages
        const [contextRes, messagesRes] = await Promise.all([
          zepClient.thread.getUserContext(threadId).catch((e) => null),
          zepClient.thread.get(threadId, { limit: 10 }).catch((e) => null)
        ])

        // Format Recent Chat messages
        let chatLog = ""
        if (messagesRes && messagesRes.messages) {
          chatLog = messagesRes.messages
            .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
            .join("\n")
        }

        // Format Zep Context Block (Long-term memory facts)
        let contextBlock = ""
        if (contextRes && contextRes.context) {
          contextBlock = `\n\n## 🧠 LONG TERM MEMORY (User Facts):\n${contextRes.context}`
        }

        fullHistory = chatLog + contextBlock
      } catch (error) {
        console.error("Failed to fetch Zep data:", error.message)
      }
    }
    // ---------------------------

    // 3. Stream risposta con Gemini
    const currentDate = new Date().toISOString().slice(0, 10)
    const finalContext = chatbotContextPrompt(
      query,
      context,
      currentDate,
      fullHistory
    )
    // Risposta completa con funzione gemini
    // prompt = system, context = user content
    const answer = await gemini(
      finalContext,
      chatbotSystemPrompt,
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
    const sources = (mergeResult.merged || []).map((src, i) => {
      const d = src.data || src
      return {
        url: d.url || "",
        title: `[${i + 1}]`,
        date: d.date || ""
      }
    })
    return {
      text: answer.content,
      sources
    }
  }
}

module.exports = { chatbot }
