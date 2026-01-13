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
const outputSchema = z.string()

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
    let answer = ""
    try {
      const response = await gemini(
        finalContext,
        chatbotSystemPrompt,
        8000,
        outputSchema
      )
      answer =
        typeof response === "string"
          ? response
          : response?.answer || JSON.stringify(response)
    } catch (err) {
      answer = `[ERRORE] ${err.message || err}`
    }
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
      await perplexityDbTool.execute({ articles: newArticles })
    }
    return answer
  }
}

module.exports = { chatbot }
