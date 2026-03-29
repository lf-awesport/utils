/**
 * @fileoverview External RAG (Retrieval-Augmented Generation) Tool
 * Allows the AI agent to search and retrieve relevant external documents to enrich user query responses.
 * @module externalRAGTool
 */
const { tool } = require("ai")
const { searchAndRerank, createContext } = require("../../retrieval/queryRAG")
const z = require("zod")

/**
 * Defines a structural AI tool for querying external documents.
 * 
 * @type {import('ai').CoreTool}
 * @property {string} description - The localized description presented to the AI agent.
 * @property {z.ZodSchema} inputSchema - The schema validating expected tool arguments.
 * @property {Function} execute - The async logic handling the search operation.
 */
const externalRAGTool = tool({
  description:
    "Cerca e riassumi documenti esterni rilevanti per la domanda dell'utente.",
  
  inputSchema: z.object({
    query: z
      .string()
      .describe("La domanda o il tema da cercare nei documenti esterni")
  }),
  
  /**
   * Searches and retrieves document contexts based on the user's query.
   * 
   * @async
   * @param {Object} params - The inputs parsed by the tool caller.
   * @param {string} params.query - The search query provided by the AI agent.
   * @returns {Promise<{context: string, docs: Array<Object>}>} The summarized context and underlying documents.
   */
  execute: async ({ query }) => {
    try {
      // Find relevant docs from the vector DB and parse them into a unified string.
      const docs = await searchAndRerank(query)
      const context = createContext(docs)
      
      return { context, docs }
    } catch (error) {
      console.error("RAG tool error:", error.message)
      
      // Return a graceful error message as the context so the AI can communicate the failure.
      return {
        context: "Si è verificato un errore durante la ricerca di documenti rilevanti. Indica che non hai trovato risultati per via di un errore tecnico.",
        docs: []
      }
    }
  }
})

/**
 * Exports the External RAG Tool instance.
 * @type {{ externalRAGTool: import('ai').CoreTool }}
 */
module.exports = { externalRAGTool }
