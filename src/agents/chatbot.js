const { Experimental_Agent: Agent, tool } = require("ai")
const z = require("zod")
const { createGeminiModel } = require("../gemini")
const { searchAndRerank } = require("../queryRAG")
const {
  agentDecisionSystemPrompt,
  chatbotSystemPrompt
} = require("../prompts.js")

/**
 * Agent for deciding between RAG and LLM response
 * Uses your custom Gemini logic for LLM responses
 */
const chatbot = new Agent({
  model: createGeminiModel(),
  system: chatbotSystemPrompt
  // tools: {
  //   testTool: tool({
  //     description: "Restituisce una risposta di test fissa.",
  //     inputSchema: z.object({}),
  //     execute: async () => {
  //       return { output: "Risposta dal tool di test!" }
  //     }
  //   })
  // }
})

module.exports = chatbot
