const { embed } = require("ai")
const { createVertex } = require("@ai-sdk/google-vertex")

/**
 * Custom error class for embedding-related errors
 */
class EmbeddingError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "EmbeddingError"
    this.originalError = originalError
  }
}

/**
 * Validates the input text for embedding generation
 * @param {string} text - The text to validate
 * @throws {TypeError} If the text is invalid
 */
function validateInput(text) {
  if (typeof text !== "string") {
    throw new TypeError("Input text must be a string")
  }
  if (text.trim().length === 0) {
    throw new TypeError("Input text cannot be empty")
  }
}

/**
 * Validates the environment configuration
 * @throws {EmbeddingError} If required environment variables are missing
 */
function validateConfig() {
  const requiredVars = [
    "PROJECT_ID",
    "LOCATION",
    "EMBEDDING_MODEL",
    "CLIENT_EMAIL",
    "PRIVATE_KEY"
  ]

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new EmbeddingError("Missing required environment variable")
    }
  }
}

/**
 * Creates and initializes the Vertex AI client
 * @returns {Object} Initialized Vertex AI client
 * @throws {EmbeddingError} If initialization fails
 */
function createVertexClient() {
  try {
    validateConfig()
    return createVertex({
      project: process.env.PROJECT_ID,
      location: process.env.LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.CLIENT_EMAIL,
          private_key: process.env.PRIVATE_KEY
        }
      }
    })
  } catch (error) {
    if (error instanceof EmbeddingError) {
      throw error
    }
    throw new EmbeddingError("Failed to initialize Vertex AI client", error)
  }
}

// Lazy initialization of the client
let vertex_ai = null

/**
 * Gets or creates the Vertex AI client
 * @returns {Object} The Vertex AI client
 */
function getVertexClient() {
  if (!vertex_ai) {
    vertex_ai = createVertexClient()
  }
  return vertex_ai
}

/**
 * Resets the Vertex AI client (for testing purposes)
 */
function _resetVertexClient() {
  vertex_ai = null
}

/**
 * Validates the embedding response
 * @param {Object} response - The API response
 * @throws {EmbeddingError} If the response is invalid
 */
function validateResponse(response) {
  if (!response || !response.embedding || !Array.isArray(response.embedding)) {
    throw new EmbeddingError(
      "Failed to generate embedding",
      new Error("Invalid embedding response from API")
    )
  }
}

/**
 * 🔠 Genera l'embedding di una query testuale con Vertex AI
 * @param {string} text - Testo della query da trasformare in embedding
 * @returns {Promise<number[]>} - Vettore embedding
 */
async function generateEmbedding(text) {
  validateInput(text)

  try {
    const client = getVertexClient()
    const response = await embed({
      model: client.textEmbeddingModel(process.env.EMBEDDING_MODEL),
      value: text
    })
    validateResponse(response)
    return response.embedding
  } catch (error) {
    if (error instanceof TypeError) {
      throw error
    }
    if (error instanceof EmbeddingError) {
      throw error
    }
    throw new EmbeddingError("Failed to generate embedding", error)
  }
}

module.exports = {
  generateEmbedding,
  EmbeddingError,
  createVertexClient,
  _resetVertexClient
}
