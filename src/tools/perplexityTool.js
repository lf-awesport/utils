const { tool } = require("ai")
const z = require("zod")
const Perplexity = require("@perplexity-ai/perplexity_ai")

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
    const search = await client.search.create(sdkParams)
    return search
  }
})

module.exports = {
  perplexitySearchTool
}
