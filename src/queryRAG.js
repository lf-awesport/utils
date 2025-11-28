const { firestore } = require("./firebase") // Firebase/Firestore client (@google-cloud/firestore)
const { generateEmbedding } = require("./embeddings")
const { rerankDocuments } = require("./reranker")
const { chatbotContextPrompt } = require("./prompts.js")

/**
 * Valori di configurazione predefiniti.
 * - limit: Numero massimo di candidati da recuperare da Vector Search (prima del Rerank).
 */
const DEFAULT_CONFIG = {
  maxTokens: 8192,
  vectorField: "embedding",
  distanceMeasure: "COSINE",
  limit: 100
}

/**
 * Classe di errore personalizzata per la gestione degli errori RAG.
 */
class RAGError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "RAGError"
    this.originalError = originalError
  }
}

/**
 * Validates input parameters for the searchSimilarDocuments function.
 * @param {Object} options - The options object.
 * @throws {TypeError} If any parameter is invalid.
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
 * Validates input parameters for the queryRAG function.
 * @param {string} query - The query string.
 * @throws {TypeError} If the query is invalid.
 */
function validateQuery(query) {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new TypeError("Query must be a non-empty string")
  }
}

/**
 * Formatta un documento in una stringa di contesto ottimizzata per l'LLM.
 * Include lo score di reranking/vettoriale e il contenuto.
 * @param {Object} doc - Il documento da formattare.
 * @returns {string} Stringa di contesto formattata.
 */
function formatDocumentContext(doc) {
  const { data } = doc

  // Contenuto ottimizzato (summary o excerpt) usato per lo score/rilevanza
  const optimizedContent =
    data.rerank_summary ||
    data.excerpt ||
    data.analysis?.cleanText || // In caso estremo, usa cleanText come fallback
    "Contenuto non disponibile."

  // Corpo completo dell'articolo, che presumibilmente è in data.analysis.cleanText.
  const fullBody = data.body || null

  // Se il contenuto ottimizzato è diverso dal corpo completo, aggiungiamo il corpo intero
  const fullBodySection =
    fullBody && fullBody !== optimizedContent
      ? `\n\nTESTO COMPLETO DELL'ARTICOLO: ${fullBody}`
      : ""

  const score =
    data.rerank_score !== undefined
      ? data.rerank_score
      : data.vector_distance || 0

  const contentSource = data.rerank_summary
    ? "TESTO OTTIMIZZATO (SUMMARY)"
    : "TESTO OTTIMIZZATO (EXCERPT)"
  const scoreLabel =
    data.rerank_score !== undefined ? "SCORE RERANK" : "SCORE VETTORIALE"

  return `
TITOLO: ${data.title}
AUTORE: ${data.author}
DATA: ${data.date}
TAGS: ${Array.isArray(data.tags) ? data.tags.join(", ") : ""}
${scoreLabel}: ${score.toFixed(4)}
${contentSource}: ${optimizedContent}
${fullBodySection}
    `
}

const createContext = (documents) => {
  const currentDate = new Date().toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })
  return documents
    .map(formatDocumentContext)
    .join("\n-----------------------------\n")
    .concat(`DATA ODIERNA: ${currentDate}`)
}

/**
 * 🔍 Ricerca documenti simili in Firestore Vector Search.
 * @param {Object} options - Opzioni di ricerca.
 * @returns {Promise<Array<Object>>} Array di documenti trovati con distanza vettoriale.
 */
async function searchSimilarDocuments({
  collectionName,
  query,
  vectorField = "embedding",
  distanceMeasure = "COSINE",
  limit = DEFAULT_CONFIG.limit,
  distanceThreshold,
  filters
} = {}) {
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

    let ref = firestore.collection(collectionName)

    if (Array.isArray(filters)) {
      filters.forEach(({ field, op, value }) => {
        ref = ref.where(field, op, value)
      })
    }

    const querySnapshot = await ref.findNearest(searchOptions).get()

    const results = querySnapshot.docs.map((doc) => {
      const distance = doc.get("vector_distance")
      const minDistance = 0.2
      const maxDistance = 0.45

      const clamped = Math.min(Math.max(distance, minDistance), maxDistance)
      const similarityRaw =
        1 - (clamped - minDistance) / (maxDistance - minDistance)
      const similarityScore = Math.round(similarityRaw * 99 + 1)

      return {
        id: doc.id,
        data: {
          ...doc.data(),
          vector_distance: distance,
          similarityScore
        }
      }
    })

    return results
  } catch (error) {
    throw new RAGError(
      `Failed to search similar documents: ${error.message}`,
      error
    )
  }
}

/**
 * 🤖 Esegue la query RAG (Retrieval-Augmented Generation).
 * 1. Cerca candidati (Vector Search).
 * 2. Riorganizza i candidati (Reranking).
 * 3. Invia i migliori al modello LLM (Generation).
 * @param {string} query - La query dell'utente.
 * @returns {Promise<Object>} Risultati con testo di risposta e fonti.
 * @throws {RAGError} In caso di fallimento della query.
 */

async function searchAndRerank(query, filters = []) {
  validateQuery(query)

  const candidateResults = await searchSimilarDocuments({
    query,
    collectionName: "sentiment",
    distanceMeasure: DEFAULT_CONFIG.distanceMeasure,
    limit: DEFAULT_CONFIG.limit,
    filters
  })

  const rerankRecords = candidateResults
    .filter((doc) => doc.data.rerank_summary || doc.data.excerpt)
    .map((doc) => ({
      id: doc.id,
      title: doc.data.title || "",
      rerank_summary: doc.data.rerank_summary || doc.data.excerpt
    }))

  const rankedResults = await rerankDocuments(query, rerankRecords)
  const candidateMap = new Map(candidateResults.map((doc) => [doc.id, doc]))
  const finalRankedDocs = rankedResults
    .map((rankedDoc) => {
      const originalDoc = candidateMap.get(rankedDoc.id)
      if (originalDoc) {
        originalDoc.data.rerank_score = rankedDoc.score
        return originalDoc
      }
      return null
    })
    .filter((doc) => doc !== null)
    .filter((doc) => doc.data.rerank_score > 0.149)
    .slice(0, 25)

  return finalRankedDocs
}

/**
 * Genera i filtri Firestore per un intervallo di date.
 * @param {Object} params - Parametri per l'intervallo di date.
 * @returns {Array<Object>} Array di filtri Firestore.
 * @throws {Error} Se l'intervallo di date non è valido.
 */
function getDateRangeFilters({ fromYear, fromMonth, toYear, toMonth }) {
  if (!fromYear && !toYear) return []

  const start = fromYear ? new Date(fromYear, (fromMonth ?? 1) - 1, 1) : null

  const endYear = toYear
  const endMonth = toMonth ? toMonth : 12
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1
  const nextYear = endMonth === 12 ? endYear + 1 : endYear

  const end = toYear ? new Date(nextYear, nextMonth - 1, 1) : null

  if (start && end && start >= end) {
    throw new Error("Invalid date range: 'from' must be earlier than 'to'.")
  }

  const format = (d) => d.toISOString().split("T")[0]
  const filters = []

  if (start) filters.push({ field: "date", op: ">=", value: format(start) })
  if (end) filters.push({ field: "date", op: "<", value: format(end) })

  return filters
}

module.exports = {
  searchSimilarDocuments,
  searchAndRerank,
  RAGError,
  getDateRangeFilters,
  createContext
}
