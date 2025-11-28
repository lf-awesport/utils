const { Experimental_Agent: Agent, tool, stepCountIs } = require("ai")
const {
  searchMemoriesTool,
  addMemoryTool
} = require("@supermemory/tools/ai-sdk")
const { searchAndRerank, createContext } = require("../queryRAG")
const { createGeminiModel } = require("../gemini")
const { chatbotSystemPrompt } = require("../prompts.js")
const z = require("zod")

// Define the RAG tool using the ai 'tool' helper
const externalRAGTool = tool({
  description:
    "Cerca e riassumi documenti esterni rilevanti per la domanda dell'utente.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("La domanda o il tema da cercare nei documenti esterni")
  }),
  execute: async ({ query }) => {
    const docs = await searchAndRerank(query)
    const context = createContext(docs)
    return { context, docs }
  }
})

async function chatbot({ userId }) {
  return new Agent({
    model: createGeminiModel(),
    system: chatbotSystemPrompt,
    tools: {
      searchMemories: searchMemoriesTool(process.env.SUPERMEMORY_API_KEY, {
        containerTags: [userId || "default"]
      }),
      addMemory: addMemoryTool(process.env.SUPERMEMORY_API_KEY, {
        containerTags: [userId || "default"]
      }),
      externalRAGTool
    },
    stopWhen: stepCountIs(3) // consenti fino a 3 step per favorire la generazione di testo dopo la tool call
  })
}

module.exports = { chatbot }
