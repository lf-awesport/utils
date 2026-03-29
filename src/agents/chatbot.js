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

// Schema di output per Gemini (risposta testuale)
const outputSchema = z.object({
  content: z.string()
})

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

const buildSources = ({ decisionTools, ragDocs }) => {
  if (decisionTools.length === 0 || !ragDocs || ragDocs.length === 0) return []

  return ragDocs.map((d, i) => ({
    url: d.url || "",
    title: `[${i + 1}]`,
    date: d.date || ""
  }))
}

async function chatbot({ query, history = [], onToken }) {
  // Map history array objects {role, content} to a readable string format
  const chatLog = Array.isArray(history) 
    ? history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\\n')
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
    onToken(chunk)
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
