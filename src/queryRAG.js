const { firestore } = require("./firebase") // usa il client @google-cloud/firestore
const { jsonSchema } = require("ai")
const { gemini } = require("./gemini")
const { askAgentPrompt } = require("./prompts")
const { generateEmbedding } = require("./embeddings")

/**
 * JSON schema for the Gemini response
 */
const schema = jsonSchema({
  $schema: "http://json-schema.org/draft-04/schema#",
  type: "object",
  properties: {
    answer: {
      type: "string"
    }
  },
  required: ["answer"]
})

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  maxTokens: 8192,
  vectorField: "embedding",
  distanceMeasure: "COSINE",
  limit: 10
}

/**
 * Error class for RAG-related errors
 */
class RAGError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "RAGError"
    this.originalError = originalError
  }
}

/**
 * Validates input parameters for the searchSimilarDocuments function
 * @param {Object} options - The options object
 * @throws {TypeError} If any parameter is invalid
 */
function validateSearchOptions(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("Search options must be an object")
  }

  const {
    collectionName,
    query,
    vectorField,
    distanceMeasure,
    limit,
    distanceThreshold,
    filters
  } = options

  if (
    typeof collectionName !== "string" ||
    collectionName.trim().length === 0
  ) {
    throw new TypeError("collectionName must be a non-empty string")
  }

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new TypeError("query must be a non-empty string")
  }

  if (
    vectorField !== undefined &&
    (typeof vectorField !== "string" || vectorField.trim().length === 0)
  ) {
    throw new TypeError("vectorField must be a non-empty string")
  }

  if (
    distanceMeasure !== undefined &&
    !["COSINE", "EUCLIDEAN", "DOT_PRODUCT"].includes(distanceMeasure)
  ) {
    throw new TypeError(
      "distanceMeasure must be one of: COSINE, EUCLIDEAN, DOT_PRODUCT"
    )
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new TypeError("limit must be a positive integer")
  }

  if (
    distanceThreshold !== undefined &&
    (typeof distanceThreshold !== "number" || isNaN(distanceThreshold))
  ) {
    throw new TypeError("distanceThreshold must be a number")
  }

  if (filters !== undefined && !Array.isArray(filters)) {
    throw new TypeError("filters must be an array")
  }
}

/**
 * Validates input parameters for the queryRAG function
 * @param {string} query - The query string
 * @throws {TypeError} If the query is invalid
 */
function validateQuery(query) {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new TypeError("Query must be a non-empty string")
  }
}

/**
 * Formats a document into a context string
 * @param {Object} doc - The document to format
 * @returns {string} Formatted context string
 */
function formatDocumentContext(doc) {
  const { data } = doc
  return `
TITOLO: ${data.title}
AUTORE: ${data.author}
DATA: ${data.date}
TAGS: ${Array.isArray(data.tags) ? data.tags.join(", ") : ""}
ESTRATTO: ${data.excerpt}
BODY: ${data.analysis?.cleanText || ""}
SCORE: ${(data.vector_distance || 0).toFixed(4)}
    `
}

/**
 * Processes search results to remove sensitive data
 * @param {Array} results - The search results
 * @returns {Array} Processed results without sensitive data
 */
function processSearchResults(results) {
  return results.map(({ id, data }) => {
    const { analysis, ...rest } = data
    const { cleanText, ...analysisRest } = analysis || {}
    return {
      id,
      ...rest,
      analysis: analysisRest
    }
  })
}

/**
 * 🔍 Ricerca documenti simili in Firestore Vector Search (con tutti i campi)
 * @param {Object} options
 * @param {string} options.collectionName - Nome della collezione (es. "sentiment")
 * @param {number[]} options.queryVector - L'embedding della query (es. da Vertex AI)
 * @param {string} [options.vectorField="embedding"] - Campo dell'embedding nel documento
 * @param {string} [options.distanceMeasure="COSINE"] - COSINE | EUCLIDEAN | DOT_PRODUCT
 * @param {number} [options.limit=25] - Numero massimo di risultati
 * @param {number} [options.distanceThreshold] - Soglia sulla distanza (dipende dal tipo)
 * @param {Array<{ field: string, op: FirebaseFirestore.WhereFilterOp, value: any }>} [options.filters] - Eventuali filtri Firestore
 * @returns {Promise<Array<{ id: string, data: any, vector_distance?: number }>>}
 */
async function searchSimilarDocuments({
  collectionName,
  query,
  vectorField = "embedding",
  distanceMeasure = "COSINE",
  limit = 5,
  distanceThreshold,
  filters
} = {}) {
  // Validate inputs immediately before any async operations
  validateSearchOptions({
    collectionName,
    query,
    vectorField,
    distanceMeasure,
    limit,
    distanceThreshold,
    filters
  })

  try {
    const queryEmbedding = await generateEmbedding(query)
    const collection = firestore.collection(collectionName)

    const searchOptions = {
      vectorField,
      queryVector: queryEmbedding,
      limit,
      distanceMeasure,
      distanceResultField: "vector_distance"
    }

    if (distanceThreshold !== undefined) {
      searchOptions.distanceThreshold = distanceThreshold
    }

    if (filters) {
      searchOptions.filters = filters
    }

    const querySnapshot = await collection.findNearest(searchOptions).get()

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      data: {
        ...doc.data(),
        vector_distance: doc.get("vector_distance")
      }
    }))
  } catch (error) {
    throw new RAGError(
      `Failed to search similar documents: ${error.message}`,
      error
    )
  }
}

/**
 * Performs RAG (Retrieval-Augmented Generation) query
 * @param {string} query - The query string
 * @returns {Promise<Object>} Query results with text and sources
 * @throws {RAGError} If query fails
 */
async function queryRAG(query) {
  try {
    validateQuery(query)

    // 2. Vector search
    const results = await searchSimilarDocuments({
      query,
      collectionName: "sentiment",
      distanceMeasure: DEFAULT_CONFIG.distanceMeasure,
      limit: DEFAULT_CONFIG.limit
    })

    // 3. Costruzione contesto per Gemini
    const context = results
      .map(formatDocumentContext)
      .join("\n-----------------------------\n")

    // 4. Chiamata a Gemini
    const text = await gemini(
      context,
      askAgentPrompt(query),
      DEFAULT_CONFIG.maxTokens,
      schema
    )

    // 5. Costruzione array di sources senza il campo BODY
    const sources = processSearchResults(results)

    return { text, sources, query }
  } catch (error) {
    if (error instanceof TypeError) {
      throw error
    }
    throw new RAGError("Failed to process RAG query", error)
  }
}

module.exports = {
  queryRAG,
  searchSimilarDocuments,
  RAGError,
  DEFAULT_CONFIG
}
