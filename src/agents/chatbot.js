const { perplexitySearchTool } = require("../tools/perplexityTool")
const { externalRAGTool } = require("../tools/externalRAGTool")
const {
  perplexityDbTool,
  normalizeArticle
} = require("../tools/perplexityDbTool")
const { mergeResultsTool } = require("../tools/mergeResultsTool")
const { gemini } = require("../gemini")
const { chatbotContextPrompt, chatbotSystemPrompt } = require("../prompts.js")
const { createContext } = require("../queryRAG")
const z = require("zod")

// Schema di output per Gemini (risposta testuale)
const outputSchema = z.object({
  content: z.string()
})

async function chatbot({ userId }) {
  // Orchestrazione manuale della pipeline
  return async function pipeline({ query, onToken }) {
    // 1. RAG e Perplexity in parallelo

    const [ragResult, perplexityResult] = await Promise.all([
      externalRAGTool.execute({ query }),
      perplexitySearchTool.execute({ query })
    ])
    const ragDocs = ragResult.docs || []
    // Normalizza i risultati Perplexity e wrappa in {data: ...} per compatibilità
    const perplexityDocs = (perplexityResult.results || [])
      .map(normalizeArticle)
      .map((a) => ({ data: a }))

    // 2. Merge e deduplica
    const mergeResult = await mergeResultsTool.execute({
      ragResults: ragDocs,
      perplexityResults: perplexityDocs
    })

    // Usa createContext per generare il contesto finale (tutti i doc ora hanno .data)
    const context = createContext(mergeResult.merged || [])

    // 3. Stream risposta con Gemini
    const currentDate = new Date().toISOString().slice(0, 10)
    const finalContext = chatbotContextPrompt(query, context, currentDate)
    // Risposta completa con funzione gemini
    // prompt = system, context = user content
    const answer = await gemini(
      finalContext,
      chatbotSystemPrompt,
      8000,
      outputSchema
    )
    // Dopo la risposta, salva i nuovi articoli
    const ragUrls = new Set(ragDocs.map((d) => d.url))
    // Estrai gli articoli normalizzati da {data: ...}
    const newArticles = []
    for (const article of perplexityDocs) {
      if (article.data.url && !ragUrls.has(article.data.url)) {
        newArticles.push(article.data)
      }
    }
    if (newArticles.length > 0) {
      // Fire-and-forget: salva in background senza bloccare la risposta
      perplexityDbTool
        .execute({ articles: newArticles })
        .catch((err) => console.error("Background save error:", err))
    }
    // Includi anche le fonti (mergeResult.merged) in formato flat per il front-end
    const sources = (mergeResult.merged || []).map((src, i) => {
      const d = src.data || src
      return {
        url: d.url || "",
        title: `[${i + 1}]`,
        date: d.date || ""
      }
    })
    return {
      text: answer.content,
      sources
    }
  }
}

module.exports = { chatbot }
