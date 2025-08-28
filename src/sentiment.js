const { FieldValue } = require("@google-cloud/firestore")
const { firestore } = require("./firebase.js")
const { jsonSchema } = require("ai")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")
const { sentimentAnalysisPrompt } = require("./prompts.js")
const { gemini } = require("./gemini.js")
require("dotenv").config({ path: require("find-config")(".env") })
const { generateEmbedding } = require("./embeddings.js")

/**
 * Default configuration for sentiment analysis
 */
const DEFAULT_CONFIG = {
  maxTokens: 8192,
  batchSize: 50,
  rateLimit: {
    maxRequests: 2,
    perMilliseconds: 60000
  }
}

/**
 * Custom error class for sentiment analysis related errors
 */
class SentimentError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "SentimentError"
    this.originalError = originalError
  }
}

/**
 * JSON schema for sentiment analysis output
 */
const SENTIMENT_SCHEMA = jsonSchema({
  $schema: "http://json-schema.org/draft-04/schema#",
  type: "object",
  properties: {
    analisi_leggibilita: {
      type: "object",
      properties: {
        punteggio_flesch_kincaid: { type: "integer" },
        tempo_di_lettura_minuti: { type: "integer" },
        spiegazione: { type: "string" }
      },
      required: [
        "punteggio_flesch_kincaid",
        "tempo_di_lettura_minuti",
        "spiegazione"
      ]
    },
    rilevazione_di_pregiudizio: {
      type: "object",
      properties: {
        tipo_di_pregiudizio: { type: "integer" },
        grado_di_pregiudizio: { type: "integer" },
        spiegazione: { type: "string" }
      },
      required: ["tipo_di_pregiudizio", "grado_di_pregiudizio", "spiegazione"]
    },
    rilevazione_emozioni: {
      type: "object",
      properties: {
        emozioni: {
          type: "object",
          properties: {
            gioia: { type: "integer" },
            tristezza: { type: "integer" },
            rabbia: { type: "integer" },
            paura: { type: "integer" },
            sorpresa: { type: "integer" }
          },
          required: ["gioia", "tristezza", "rabbia", "paura", "sorpresa"]
        },
        spiegazione: { type: "string" }
      },
      required: ["emozioni", "spiegazione"]
    },
    tags: { type: "array", items: { type: "string" } },
    takeaways: { type: "array", items: { type: "string" } },
    cleanText: { type: "string" },
    scopo: { type: "string" },
    tesi_principale: { type: "string" },
    concetti_chiave: { type: "array", items: { type: "string" } },
    dominio: { type: "string" },
    tipo_contenuto: { type: "string" },
    contesto_geografico: { type: "string" },
    validita_temporale: { type: "string" },
    target_audience: { type: "string" },
    entita_rilevanti: { type: "array", items: { type: "string" } }
  },
  required: [
    "analisi_leggibilita",
    "rilevazione_di_pregiudizio",
    "rilevazione_emozioni",
    "tags",
    "takeaways",
    "cleanText",
    "scopo",
    "tesi_principale",
    "concetti_chiave",
    "dominio",
    "tipo_contenuto",
    "contesto_geografico",
    "validita_temporale",
    "target_audience",
    "entita_rilevanti"
  ]
})

/**
 * Creates a rate-limited HTTP client
 * @returns {import('axios').AxiosInstance} Rate-limited Axios instance
 */
function createHttpClient() {
  return rateLimit(axios.create(), DEFAULT_CONFIG.rateLimit)
}

/**
 * Generates the full text content for embedding
 * @param {Object} postData - The post data
 * @param {Object} analysis - The sentiment analysis results
 * @returns {string} The formatted text for embedding
 */
function generateFullText(postData, analysis) {
  return `
    TITOLO: ${postData.title}
    AUTORE: ${postData.author}
    DATA: ${postData.date}
    TAGS: ${Array.isArray(analysis?.tags) ? analysis.tags.join(", ") : ""}
    ESTRATTO: ${postData.excerpt}
    BODY: ${postData.body}
    ---
    ANALISI:
    ${JSON.stringify(analysis)}
  `.trim()
}

/**
 * Prepares a document for Firestore
 * @param {string} postId - The post ID
 * @param {Object} postData - The post data
 * @param {Object} analysis - The sentiment analysis results
 * @param {number[]} embedding - The generated embedding
 * @returns {Object} The prepared document
 */
function prepareDocument(postId, postData, analysis, embedding) {
  return {
    id: postId,
    embedding: FieldValue.vector(embedding),
    analysis,
    prejudice: analysis?.rilevazione_di_pregiudizio?.grado_di_pregiudizio,
    readability: analysis?.analisi_leggibilita?.punteggio_flesch_kincaid,
    tags: analysis?.tags,
    url: postData.url,
    excerpt: postData.excerpt,
    imgLink: postData.imgLink,
    title: postData.title,
    date: postData.date,
    author: postData.author,
    body: postData.body
  }
}

/**
 * Processes a single article
 * @param {Object} post - The post document
 * @returns {Promise<Object>} The processed document data
 * @throws {SentimentError} If processing fails
 */
async function processArticle(post) {
  const postId = post.id
  const postData = post.data()

  try {
    // 1. Sentiment Analysis
    const analysis = await gemini(
      postData.body,
      sentimentAnalysisPrompt,
      DEFAULT_CONFIG.maxTokens,
      SENTIMENT_SCHEMA
    )

    if (!analysis || !analysis.analisi_leggibilita) {
      throw new SentimentError("Invalid or incomplete analysis")
    }

    // 2. Generate embedding
    const fullText = generateFullText(postData, analysis)
    const embedding = await generateEmbedding(fullText)

    // 3. Prepare document
    return prepareDocument(postId, postData, analysis, embedding)
  } catch (error) {
    throw new SentimentError(`Failed to process article ${postId}`, error)
  }
}

/**
 * Processes unprocessed articles in batches
 * @returns {Promise<void>}
 */
async function processArticles() {
  try {
    // Create HTTP client
    createHttpClient()

    // Get unprocessed posts
    const postsSnap = await firestore
      .collection("posts")
      .where("processed", "==", false)
      .get()

    const total = postsSnap.size
    if (total === 0) {
      console.log("📭 No new posts to process.")
      return
    }

    let batch = firestore.batch()
    let count = 0

    for (const [index, post] of postsSnap.docs.entries()) {
      console.log(`🔄 Processing ${index + 1}/${total}: ${post.id}`)

      try {
        // Process the article
        const processedDoc = await processArticle(post)

        // Add to batch
        batch.set(
          firestore.collection("sentiment").doc(post.id),
          processedDoc,
          { merge: true }
        )
        batch.update(firestore.collection("posts").doc(post.id), {
          processed: true
        })
        count++

        // Commit batch if size limit reached
        if (count % DEFAULT_CONFIG.batchSize === 0) {
          await batch.commit()
          console.log(
            `✅ Committed batch of ${DEFAULT_CONFIG.batchSize} documents`
          )
          batch = firestore.batch()
        }
      } catch (error) {
        console.warn(`⚠️ Skipping article ${post.id}: ${error.message}`)
        if (error.originalError) {
          console.debug("Original error:", error.originalError)
        }
      }
    }

    // Commit remaining documents
    if (count % DEFAULT_CONFIG.batchSize !== 0) {
      await batch.commit()
    }

    console.log(`🎉 Done! Processed and saved ${count} posts out of ${total}`)
  } catch (error) {
    const finalError =
      error instanceof SentimentError
        ? error
        : new SentimentError("Fatal error in processArticles", error)
    console.error("❌", finalError.message)
    if (finalError.originalError) {
      console.debug("Original error:", finalError.originalError)
    }
    throw finalError
  }
}

module.exports = {
  processArticles,
  SentimentError,
  DEFAULT_CONFIG, // Exported for testing
  SENTIMENT_SCHEMA // Exported for testing
}
