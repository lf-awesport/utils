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
      if (doc.url) byUrl.set(doc.url, doc)
    }
    // Poi i Perplexity (solo se non già presenti)
    for (const article of perplexityResults) {
      if (article.url && !byUrl.has(article.url)) {
        byUrl.set(article.url, article)
      }
    }
    // Ordina per data decrescente se disponibile
    const merged = Array.from(byUrl.values()).sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      return 0
    })
    // Compose context string
    const context = merged
      .map(
        (a) =>
          `TITOLO: ${a.title}\nAUTORE: ${a.author}\nDATA: ${a.date}\nURL: ${a.url}\nESTRATTO: ${a.excerpt}\nBODY: ${a.body?.slice(0, 1000)}`
      )
      .join("\n-----------------------------\n")
    return { context, merged }
  }
})

module.exports = { mergeResultsTool }
