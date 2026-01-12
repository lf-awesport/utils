const { Experimental_Agent: Agent, stepCountIs } = require("ai")
const {
  searchMemoriesTool,
  addMemoryTool
} = require("@supermemory/tools/ai-sdk")
const { perplexitySearchTool } = require("../tools/perplexityTool")
const { externalRAGTool } = require("../tools/externalRAGTool")
const { createGeminiModel } = require("../gemini")
const { chatbotSystemPrompt } = require("../prompts.js")
const z = require("zod")

async function chatbot({ userId }) {
  // Prompt aggiornato: l'agente deve sempre usare prima il RAG (externalRAGTool) e poi Perplexity (perplexitySearch), aggiungendo solo nuovi articoli da Perplexity
  const systemPrompt = `${chatbotSystemPrompt}\n\nISTRUZIONI: Per ogni domanda, esegui SEMPRE prima una ricerca nel database interno (usando externalRAGTool), poi una ricerca web in tempo reale (usando perplexitySearch). Se Perplexity trova articoli nuovi (per URL), aggiungili sia al contesto che al database; altrimenti usa solo i risultati del database.`
  return new Agent({
    model: createGeminiModel(),
    system: systemPrompt,
    tools: {
      searchMemories: searchMemoriesTool(process.env.SUPERMEMORY_API_KEY, {
        containerTags: [userId || "default"]
      }),
      addMemory: addMemoryTool(process.env.SUPERMEMORY_API_KEY, {
        containerTags: [userId || "default"]
      }),
      externalRAGTool,
      perplexitySearchTool
    },
    stopWhen: stepCountIs(4)
  })
}

module.exports = { chatbot }
