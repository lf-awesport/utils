const { Experimental_Agent: Agent, tool, stepCountIs } = require("ai")
const z = require("zod")
const { createGeminiModel } = require("../gemini")
const { searchAndRerank, createContext } = require("../queryRAG")
const { agentDecisionSystemPrompt } = require("../prompts.js")

/**
 * Agent for deciding between RAG and LLM response
 * Uses your custom Gemini logic for LLM responses
 */

const chatbot = new Agent({
  model: createGeminiModel(),
  system: agentDecisionSystemPrompt,
  tools: {
    searchContext: tool({
      description:
        "Cerca informazioni aggiuntive e fornisce contesto rilevante usando search e rerank. Usa questo tool solo se la domanda richiede dati, fonti, o analisi contestuale. NON spiegare che userai uno strumento: usalo e basta.",
      inputSchema: z.object({
        query: z.string().describe("La domanda o il tema da cercare")
      }),
      execute: async ({ query }) => {
        const documents = await searchAndRerank(query)
        const chatbotContext = createContext(query, documents)
        return { answer: chatbotContext }
      }
    })
  },
  stopWhen: stepCountIs(2)
})

module.exports = chatbot
