/**
 * @fileoverview Google Vertex AI (Gemini) Integration
 * Sets up external AI SDK connectors initializing Vertex foundations with proper safety headers.
 * @module geminiService
 */
const { createVertex } = require("@ai-sdk/google-vertex")
const { generateObject, streamText, generateText } = require("ai")
const { config, requireEnv } = require("../config")

/**
 * Baseline strict safety filter parameters protecting generated AI models.
 * @type {Array<Object>}
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

const { AppError } = require("../errors")

/**
 * Custom error classification specific to LLM API faults or network bounds execution.
 * @extends AppError 
 */
class GeminiError extends AppError {
  constructor(message, originalError = null) {
    super(message, { status: 502, code: "EXTERNAL_SERVICE_ERROR", details: originalError })
    this.name = "GeminiError"
  }
}

/**
 * Hard validity checker verifying function payloads before firing paid logic.
 * @throws {TypeError}
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
 * Unstructured text equivalent constraint logic.
 * @throws {TypeError}
 */
function validateStreamInput(content, prompt, maxTokens) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TypeError("Content must be a non-empty string")
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("Prompt must be a non-empty string")
  }
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new TypeError("maxTokens must be a positive integer")
  }
}

let cachedModel = null;

/**
 * Connects directly to Google Cloud Vertex APIs using initialized private key parameters parsing options natively.
 * 
 * @param {Object} [headers={}] - Custom outgoing HTTP headers (e.g. proxying user credentials).
 * @returns {Object} Instantiated AI model pointer config ready.
 */
function getGeminiModel(headers = {}) {
  if (cachedModel && Object.keys(headers).length === 0) {
    return cachedModel;
  }

  requireEnv(["PROJECT_ID", "LOCATION", "MODEL"], (msg) => new GeminiError(msg))

  try {
    const vertex_ai = createVertex({
      project: config.projectId,
      location: config.location,
      googleAuthOptions: {
        credentials: {
          client_email: config.clientEmail,
          private_key: config.privateKey
        }
      },
      headers
    })

    const model = vertex_ai(config.model, {
      structuredOutputs: true,
      temperature: 0,
      topP: 0,
      topK: 1,
      safetySettings: DEFAULT_SAFETY_SETTINGS,
      thinkingConfig: { thinkingBudget: 0 }
    })

    if (Object.keys(headers).length === 0) {
      cachedModel = model;
    }
    
    return model;
  } catch (error) {
    throw new GeminiError("Failed to initialize Gemini model", error)
  }
}

/**
 * Fires the @ai-sdk syntax yielding strictly typed JSON response objects strictly verified against input schema blocks.
 * 
 * @async
 * @param {string} content - Raw user conversational text.
 * @param {string} prompt - Static system configuration behavior.
 * @param {number} maxTokens - Max outbound limits avoiding arbitrary generation costs.
 * @param {Object} schema - Required format definitions Zod object outputs mapped explicitly.
 * @returns {Promise<Object>}
 */
async function gemini(content, prompt, maxTokens, schema) {
  validateInput(content, prompt, maxTokens, schema)
  try {
    const generativeModel = getGeminiModel()

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
    if (error instanceof TypeError) throw error
    if (error instanceof GeminiError) throw error
    throw new GeminiError("Failed to generate response", error)
  }
}

/**
 * Generates plain text output using the Gemini model
 * @param {string} content - The input content to process
 * @param {string} prompt - The system prompt to guide the generation
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<string>} - Generated text
 */
async function geminiText(content, prompt, maxTokens) {
  validateStreamInput(content, prompt, maxTokens)
  try {
    const generativeModel = getGeminiModel()
    const { text } = await generateText({
      model: generativeModel,
      system: prompt.trim(),
      prompt: content.trim(),
      maxTokens
    })
    return text
  } catch (error) {
    if (error instanceof TypeError) throw error
    throw new GeminiError("Failed to generate text response", error)
  }
}

/**
 * Streams text output using the Gemini model
 * @param {string} content - The input content to process
 * @param {string} prompt - The system prompt to guide the generation
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<AsyncIterable<string>>} - Stream of generated text chunks
 * @throws {GeminiError} If generation fails
 * @throws {TypeError} If parameters are invalid
 */
async function geminiStream(content, prompt, maxTokens) {
  validateStreamInput(content, prompt, maxTokens)
  try {
    const generativeModel = getGeminiModel()
    const { textStream } = await streamText({
      model: generativeModel,
      system: prompt.trim(),
      prompt: content.trim(),
      maxTokens
    })
    return textStream
  } catch (error) {
    if (error instanceof TypeError) throw error
    if (error instanceof GeminiError) throw error
    throw new GeminiError("Failed to stream response", error)
  }
}

module.exports = {
  gemini,
  geminiText,
  geminiStream,
  GeminiError,
  DEFAULT_SAFETY_SETTINGS,
  getGeminiModel
}
