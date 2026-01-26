const { tool } = require("ai")
const { searchAndRerank, createContext } = require("../../retrieval/queryRAG")
const z = require("zod")

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

module.exports = { externalRAGTool }
