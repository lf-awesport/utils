const { firestore } = require("./firebase") // usa il client @google-cloud/firestore
const { jsonSchema } = require("ai")
const { gemini } = require("./gemini")
const { askAgentPrompt } = require("./prompts")
const { generateEmbedding } = require("./embeddings")

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

const maxTokens = 512

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
  queryVector,
  vectorField = "embedding",
  distanceMeasure = "COSINE",
  limit = 25,
  distanceThreshold,
  filters = []
}) {
  try {
    let coll = firestore.collection(collectionName)

    // Applica eventuali filtri
    for (const filter of filters) {
      coll = coll.where(filter.field, filter.op, filter.value)
    }

    // Costruzione query vettoriale
    const vectorQuery = coll.findNearest({
      vectorField,
      queryVector,
      limit,
      distanceMeasure,
      distanceResultField: "vector_distance",
      ...(distanceThreshold !== undefined ? { distanceThreshold } : {})
    })

    const snapshot = await vectorQuery.get()

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: { ...doc.data(), vector_distance: doc.get("vector_distance") }
    }))
  } catch (error) {
    console.error("❌ Errore in searchSimilarDocuments:", error)
    throw error
  }
}

async function queryRAG(userQuestion) {
  // 1. Embedding della domanda
  const embedding = await generateEmbedding(userQuestion)

  // 2. Vector search
  const results = await searchSimilarDocuments({
    collectionName: "sentiment",
    queryVector: embedding,
    distanceMeasure: "COSINE",
    limit: 10
  })

  // 3. Costruzione contesto per Gemini
  const context = results
    .map(
      ({ data }) => `
TITOLO: ${data.title}
AUTORE: ${data.author}
DATA: ${data.date}
TAGS: ${Array.isArray(data.tags) ? data.tags.join(", ") : ""}
ESTRATTO: ${data.excerpt}
BODY: ${data.analysis?.cleanText || ""}
SCORE: ${(data.vector_distance || 0).toFixed(4)}
    `
    )
    .join("\n-----------------------------\n")

  // 4. Chiamata a Gemini
  const text = await gemini(
    context,
    askAgentPrompt(userQuestion),
    maxTokens,
    schema
  )

  // 5. Costruzione array di sources senza il campo BODY
  const sources = results.map(({ id, data }) => {
    const { analysis, ...rest } = data
    const { cleanText, ...analysisRest } = analysis || {}
    return {
      id,
      ...rest,
      analysis: analysisRest
    }
  })

  return { text, sources }
}

module.exports = {
  queryRAG,
  searchSimilarDocuments
}
