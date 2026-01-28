const {
  perplexitySearchTool,
  normalizeArticle
} = require("./tools/perplexityTool")
const { externalRAGTool } = require("./tools/externalRAGTool")
const { geminiStream } = require("../services/gemini")
const {
  chatbotContextPrompt,
  chatbotSystemPrompt,
  conversationalContextPrompt,
  conversationalSystemPrompt
} = require("../prompts.js")
const { createContext } = require("../retrieval/queryRAG")
const {
  zepClient,
  ensureZepSession,
  fetchZepMemory
} = require("../services/zep")
const { toolRouter } = require("./router")
const z = require("zod")

// Schema di output per Gemini (risposta testuale)
const outputSchema = z.object({
  content: z.string()
})

const ZEP_TIMEOUT_MS = 5000
const ZEP_MESSAGES_LIMIT = 10

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ])

const fetchZepMemoryWithTimeout = async ({
  userId,
  threadId,
  zepSetupPromise
}) => {
  if (!userId || !threadId) return { chatLog: "", zepContextString: "" }

  try {
    return await withTimeout(
      (async () => {
        await zepSetupPromise
        return fetchZepMemory({
          userId,
          threadId,
          zepSetupPromise,
          limit: ZEP_MESSAGES_LIMIT
        })
      })(),
      ZEP_TIMEOUT_MS,
      `Zep retrieval timed out (${ZEP_TIMEOUT_MS}ms)`
    )
  } catch (error) {}

  return { chatLog: "", zepContextString: "" }
}

const runTools = async ({ query, useRag, usePerp }) => {
  // Always include RAG when Perplexity is used to keep sources complete
  const effectiveUseRag = useRag || usePerp

  const tasks = [
    effectiveUseRag
      ? externalRAGTool.execute({ query })
      : Promise.resolve({ docs: [] }),
    usePerp
      ? perplexitySearchTool.execute({ query })
      : Promise.resolve({ results: [] })
  ]

  const [ragRes, perpRes] = await Promise.allSettled(tasks)

  const ragResult = ragRes.status === "fulfilled" ? ragRes.value : { docs: [] }
  const perplexityResult =
    perpRes.status === "fulfilled" ? perpRes.value : { results: [] }

  // swallow tool errors (handled by empty results)

  const ragDocs = ragResult.docs || []
  const perplexityDocs = (perplexityResult.results || [])
    .map(normalizeArticle)
    .map((a) => ({ data: a }))

  const ragUrls = new Set(ragDocs.map((d) => d.url))
  const filteredPerpDocs = perplexityDocs.filter(
    (p) => p.data.url && !ragUrls.has(p.data.url)
  )

  const combinedDocs = [...ragDocs, ...filteredPerpDocs]
  const context = createContext(combinedDocs)

  return { ragDocs, perplexityDocs: filteredPerpDocs, combinedDocs, context }
}

const buildSources = ({
  decisionTools,
  combinedDocs,
  ragDocs,
  perplexityDocs
}) => {
  if (decisionTools.length === 0) return []

  const allDocs =
    combinedDocs.length > 0
      ? combinedDocs.map((d) => d.data)
      : [...ragDocs, ...perplexityDocs.map((p) => p.data)]

  return allDocs.map((d, i) => ({
    url: d.url || "",
    title: `[${i + 1}]`,
    date: d.date || ""
  }))
}

const buildSavePromise = ({ userId, threadId, query }) => {
  if (!userId || !threadId) return Promise.resolve()

  return zepClient.thread
    .addMessages(threadId, {
      messages: [{ role: "user", name: userId, content: query }]
    })
    .catch((err) => console.error("Failed to save to Zep:", err))
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
    const { chatLog, zepContextString } = await fetchZepMemoryWithTimeout({
      userId,
      threadId,
      zepSetupPromise
    })

    // --- PHASE 2: ROUTER DECISION ---
    const decision = await toolRouter({ query, history: chatLog })

    // --- PHASE 3: CONDITIONAL TOOL EXECUTION ---
    const currentDate = new Date().toISOString().slice(0, 10)
    let ragDocs = []
    let perplexityDocs = []
    let combinedDocs = []
    let finalSystemPrompt = conversationalSystemPrompt
    let finalUserPrompt = ""

    // A. RAG MODE
    if (decision.tools.length > 0) {
      const useRag = true
      const usePerp = true
      const toolsResult = await runTools({ query, useRag, usePerp })
      ragDocs = toolsResult.ragDocs
      perplexityDocs = toolsResult.perplexityDocs
      combinedDocs = toolsResult.combinedDocs
      const context = toolsResult.context
      finalSystemPrompt = chatbotSystemPrompt
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
    if (typeof onToken !== "function") {
      throw new Error("Streaming required: onToken callback missing")
    }

    let answerContent = ""
    const textStream = await geminiStream(
      finalUserPrompt,
      finalSystemPrompt,
      32000
    )
    for await (const chunk of textStream) {
      answerContent += chunk
      onToken(chunk)
    }

    // --- PARALLEL SAVING AND DOC PREP ---
    const savePromise = buildSavePromise({
      userId,
      threadId,
      query
    })

    // ----------------------------------------
    // Includi anche le fonti (mergeResult.merged) in formato flat per il front-end
    const sources = buildSources({
      decisionTools: decision.tools,
      combinedDocs,
      ragDocs,
      perplexityDocs
    })

    return {
      text: answerContent,
      sources,
      savePromise // Return this so the route handler can await it AFTER sending response
    }
  }
}

module.exports = { chatbot }
