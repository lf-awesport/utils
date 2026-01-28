const { tool } = require("ai")
const z = require("zod")
const Perplexity = require("@perplexity-ai/perplexity_ai")
const rng = require("seedrandom")

function generateId(seed) {
  return rng(seed)().toString()
}

function normalizeArticle(article) {
  const {
    id,
    title,
    url,
    snippet,
    date,
    body,
    excerpt,
    imgLink,
    author,
    processed,
    createdAt
  } = article
  const cleanTitle = title?.trim() || ""
  const cleanUrl = url?.trim() || ""
  const docId = id || generateId(cleanTitle || cleanUrl)
  return {
    id: docId,
    title: cleanTitle,
    url: cleanUrl,
    body: body || snippet || "",
    excerpt: excerpt || snippet?.split("\n")[0] || snippet || "",
    date: date || null,
    imgLink: imgLink || null,
    author: author || "Perplexity",
    processed: processed || false,
    createdAt: createdAt || new Date()
  }
}

// Zod schema for all advanced options
const perplexityInputSchema = z.object({
  query: z
    .union([z.string(), z.array(z.string())])
    .describe("Single query string or array of queries for multi-query search"),
  maxResults: z.number().min(1).max(20).optional(),
  maxTokens: z.number().min(1).max(1000000).optional(),
  maxTokensPerPage: z.number().min(1).max(2048).optional(),
  country: z.string().length(2).optional(),
  searchDomainFilter: z.array(z.string()).max(20).optional(),
  searchLanguageFilter: z.array(z.string().length(2)).max(10).optional()
})

const perplexitySearchTool = tool({
  description:
    "Effettua una ricerca web in tempo reale tramite Perplexity Search API, con opzioni avanzate (multi-query, filtri dominio, lingua, paese, limiti token)",
  inputSchema: perplexityInputSchema,
  execute: async (params) => {
    const client = new Perplexity()
    // Map params to SDK
    const sdkParams = {
      query: params.query,
      maxResults: params.maxResults,
      maxTokens: params.maxTokens,
      maxTokensPerPage: params.maxTokensPerPage,
      country: params.country,
      searchDomainFilter: params.searchDomainFilter,
      searchLanguageFilter: params.searchLanguageFilter
    }
    // Remove undefined values
    Object.keys(sdkParams).forEach(
      (key) => sdkParams[key] === undefined && delete sdkParams[key]
    )
    try {
      const search = await client.search.create(sdkParams)
      const numResults = Array.isArray(search.results) ? search.results.length : 0
      return search
    } catch (error) {
      const status = error?.status || error?.statusCode
      const message = error?.message || "Unknown Perplexity error"
      console.error("Perplexity search error", { status, message })
      throw error
    }
  }
})

module.exports = {
  perplexitySearchTool,
  normalizeArticle
}
