const { tool } = require("ai")
const z = require("zod")

const mergeResultsTool = tool({
  description:
    "Unisce e deduplica i risultati di RAG (database) e Perplexity, preferendo i documenti enriched (RAG) e aggiungendo solo i nuovi articoli da Perplexity.",
  inputSchema: z.object({
    ragResults: z
      .array(z.any())
      .describe("Risultati enriched dal database interno (RAG)"),
    perplexityResults: z
      .array(z.any())
      .describe("Risultati freschi da Perplexity")
  }),
  execute: async ({ ragResults, perplexityResults }) => {
    // Crea una mappa per URL, priorità ai doc enriched (RAG)
    const byUrl = new Map()
    for (const doc of ragResults) {
      if (doc.data.url) byUrl.set(doc.data.url, doc)
    }
    // Poi i Perplexity (solo se non già presenti)
    for (const article of perplexityResults) {
      if (article.data.url && !byUrl.has(article.data.url)) {
        byUrl.set(article.data.url, article)
      }
    }
    // Ordina per data decrescente se disponibile
    const merged = Array.from(byUrl.values()).sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      return 0
    })
    // La generazione della context string viene ora delegata a valle (es. createContext)
    return { merged }
  }
})

module.exports = { mergeResultsTool }
