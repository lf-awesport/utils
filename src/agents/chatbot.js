/**
 * @fileoverview Conversational Chatbot Agent
 * Coordinates query routing, tool execution (like RAG), and streaming generated AI responses to clients.
 * @module chatbotAgent
 */
const { externalRAGTool } = require("./tools/externalRAGTool")
const { geminiStream } = require("../services/gemini")
const {
  chatbotContextPrompt,
  chatbotSystemPrompt,
  conversationalContextPrompt,
  conversationalSystemPrompt
} = require("../prompts.js")
const { createContext } = require("../retrieval/queryRAG")
const { toolRouter } = require("./router")
const z = require("zod")

// Output schema structurally commanding Vertex AI text generations.
const outputSchema = z.object({
  content: z.string()
})

/**
 * Invokes necessary external tools conditionally based on router output.
 * @async
 * @param {Object} params - Tool parameters.
 * @param {string} params.query - Target query to invoke the RAG tool.
 * @returns {Promise<{ragDocs: Array, context: string}>} Context payload for AI reasoning.
 */
const runTools = async ({ query }) => {
  try {
    const ragResult = await externalRAGTool.execute({ query })
    const ragDocs = ragResult.docs || []
    const context = createContext(ragDocs)
    return { ragDocs, context }
  } catch (error) {
    console.error("Error running RAG tool:", error)
    return { ragDocs: [], context: "" }
  }
}

/**
 * Normalizes document subsets into user-facing citation sources attached to the streaming payload.
 */
const buildSources = ({ decisionTools, ragDocs }) => {
  if (decisionTools.length === 0 || !ragDocs || ragDocs.length === 0) return []

  return ragDocs.map((d, i) => ({
    url: d.url || "",
    title: `[${i + 1}]`,
    date: d.date || ""
  }))
}

/**
 * Main AI Chatbot lifecycle encapsulating routing, logic execution, and live streaming.
 * @async
 * @param {Object} args - Input configuration.
 * @param {string} args.query - Live user input.
 * @param {Array<Object>} [args.history=[]] - Historical conversational messages for context padding.
 * @param {Function} args.onToken - SSE continuous callback injecting streaming chunks incrementally.
 * @returns {Promise<{text: string, sources: Array}>} Final static data confirmation.
 */
async function chatbot({ query, history = [], onToken }) {
  // Map history array objects {role, content} to a readable string format
  const chatLog = Array.isArray(history)
    ? history
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
        )
        .join("\\n")
    : ""

  // --- PHASE 1: ROUTER DECISION ---
  const decision = await toolRouter({ query, history: chatLog })

  // --- PHASE 2: CONDITIONAL TOOL EXECUTION ---
  const currentDate = new Date().toISOString().slice(0, 10)
  let ragDocs = []
  let finalSystemPrompt = conversationalSystemPrompt
  let finalUserPrompt = ""

  // A. RAG MODE
  if (decision.tools.length > 0) {
    const toolsResult = await runTools({ query })
    ragDocs = toolsResult.ragDocs
    const context = toolsResult.context

    finalSystemPrompt = chatbotSystemPrompt
    finalUserPrompt = chatbotContextPrompt(query, context, currentDate, chatLog)
  }
  // B. CONVERSATIONAL MODE
  else {
    finalUserPrompt = conversationalContextPrompt(query, currentDate, chatLog)
  }

  // --- PHASE 3: STREAMING RESPONSE ---
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
    onToken(chunk) // Transmit chunk via callback directly to the Express layer.
  }

  // --- PREPARE SOURCES ---
  const sources = buildSources({
    decisionTools: decision.tools,
    ragDocs
  })

  return {
    text: answerContent,
    sources
  }
}

module.exports = { chatbot }
