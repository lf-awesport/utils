const { createVertex } = require("@ai-sdk/google-vertex")
require("dotenv").config({ path: require("find-config")(".env") })
const { generateObject } = require("ai")

/**
 * Default safety settings for the Gemini model
 */
const DEFAULT_SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  }
]

/**
 * Error class for Gemini API related errors
 */
class GeminiError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "GeminiError"
    this.originalError = originalError
  }
}

/**
 * Validates input parameters for the Gemini function
 * @param {string} content - The input content to process
 * @param {string} prompt - The system prompt to guide the generation
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @param {object} schema - JSON schema for structured output
 * @throws {TypeError} If any parameter is invalid
 */
function validateInput(content, prompt, maxTokens, schema) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TypeError("Content must be a non-empty string")
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("Prompt must be a non-empty string")
  }
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new TypeError("maxTokens must be a positive integer")
  }
  if (!schema || typeof schema !== "object") {
    throw new TypeError("schema must be a valid JSON schema object")
  }
}

/**
 * Creates and initializes the Gemini model
 * @returns {Object} Initialized Gemini model
 * @throws {GeminiError} If model initialization fails
 */
function createGeminiModel() {
  if (!process.env.PROJECT_ID || !process.env.LOCATION || !process.env.MODEL) {
    throw new GeminiError(
      "Missing required environment variables: PROJECT_ID, LOCATION, or MODEL"
    )
  }

  try {
    const vertex_ai = createVertex({
      project: process.env.PROJECT_ID,
      location: process.env.LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.CLIENT_EMAIL,
          private_key: process.env.PRIVATE_KEY
        }
      }
    })

    return vertex_ai(process.env.MODEL, {
      structuredOutputs: true,
      temperature: 0,
      topP: 0,
      topK: 1,
      safetySettings: DEFAULT_SAFETY_SETTINGS
    })
  } catch (error) {
    throw new GeminiError("Failed to initialize Gemini model", error)
  }
}

// Initialize the Gemini model
let generativeModel
try {
  generativeModel = createGeminiModel()
} catch (error) {
  console.error("Failed to initialize Gemini model:", error.message)
  throw error
}

/**
 * Generates structured output using the Gemini model
 * @param {string} content - The input content to process
 * @param {string} prompt - The system prompt to guide the generation
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @param {object} schema - JSON schema for structured output
 * @returns {Promise<object>} - Generated structured output
 * @throws {GeminiError} If generation fails
 * @throws {TypeError} If parameters are invalid
 */
async function gemini(content, prompt, maxTokens, schema) {
  // Input validation
  validateInput(content, prompt, maxTokens, schema)

  try {
    const { object } = await generateObject({
      model: generativeModel,
      system: prompt.trim(),
      prompt: content.trim(),
      maxTokens,
      schema
    })

    if (!object) {
      throw new GeminiError("Received empty response from API")
    }

    return object
  } catch (error) {
    // If it's a TypeError from schema validation, propagate it
    if (error instanceof TypeError) {
      throw error
    }
    // If it's already a GeminiError, propagate it
    if (error instanceof GeminiError) {
      throw error
    }
    // Otherwise, wrap it in a GeminiError
    throw new GeminiError("Failed to generate response", error)
  }
}

module.exports = {
  gemini,
  GeminiError,
  DEFAULT_SAFETY_SETTINGS,
  createGeminiModel // Exported for testing
}
