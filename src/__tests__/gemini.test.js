const { createVertex } = require("@ai-sdk/google-vertex")
const { generateObject } = require("ai")

// Mock external dependencies
jest.mock("@ai-sdk/google-vertex")
jest.mock("ai")
jest.mock("dotenv")

// Mock model instance
const mockModel = {
  id: "mock-gemini-model"
}

// Mock Vertex AI client
const mockVertexAI = jest.fn().mockReturnValue(mockModel)
createVertex.mockReturnValue(mockVertexAI)

// Set required environment variables before requiring the module
process.env.PROJECT_ID = "test-project"
process.env.LOCATION = "test-location"
process.env.MODEL = "test-model"
process.env.CLIENT_EMAIL = "test@example.com"
process.env.PRIVATE_KEY = "test-key"

const {
  gemini,
  GeminiError,
  DEFAULT_SAFETY_SETTINGS,
  createGeminiModel
} = require("../gemini")

describe("gemini", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
    // Reset generateObject mock
    generateObject.mockReset()
  })

  afterAll(() => {
    // Clean up environment variables
    delete process.env.PROJECT_ID
    delete process.env.LOCATION
    delete process.env.MODEL
    delete process.env.CLIENT_EMAIL
    delete process.env.PRIVATE_KEY
  })

  describe("model initialization", () => {
    it("should throw GeminiError if required env vars are missing", () => {
      const originalProjectId = process.env.PROJECT_ID
      delete process.env.PROJECT_ID
      expect(() => createGeminiModel()).toThrow(GeminiError)
      process.env.PROJECT_ID = originalProjectId
    })

    it("should throw GeminiError if client initialization fails", () => {
      const error = new Error("Client init failed")
      createVertex.mockImplementationOnce(() => {
        throw error
      })
      expect(() => createGeminiModel()).toThrow(GeminiError)
    })

    it("should initialize model with correct configuration", () => {
      createGeminiModel()
      expect(createVertex).toHaveBeenCalledWith({
        project: "test-project",
        location: "test-location",
        googleAuthOptions: {
          credentials: {
            client_email: "test@example.com",
            private_key: "test-key"
          }
        }
      })
      expect(mockVertexAI).toHaveBeenCalledWith("test-model", {
        structuredOutputs: true,
        temperature: 0,
        topP: 0,
        safetySettings: DEFAULT_SAFETY_SETTINGS
      })
    })
  })

  describe("input validation", () => {
    const validPrompt = "test prompt"
    const validMaxTokens = 100
    const validSchema = { type: "object" }

    it("should throw TypeError for invalid content", async () => {
      const invalidInputs = ["", "   ", null, undefined, 123, {}, [], false]

      for (const input of invalidInputs) {
        await expect(
          gemini(input, validPrompt, validMaxTokens, validSchema)
        ).rejects.toThrow(TypeError)
      }
    })

    it("should throw TypeError for invalid prompt", async () => {
      const invalidPrompts = ["", "   ", null, undefined, 123, {}, [], false]

      for (const prompt of invalidPrompts) {
        await expect(
          gemini("valid content", prompt, validMaxTokens, validSchema)
        ).rejects.toThrow(TypeError)
      }
    })

    it("should throw TypeError for invalid maxTokens", async () => {
      const invalidTokens = [0, -1, 1.5, "100", null, undefined, {}, [], false]

      for (const tokens of invalidTokens) {
        await expect(
          gemini("valid content", validPrompt, tokens, validSchema)
        ).rejects.toThrow(TypeError)
      }
    })

    it("should throw TypeError for invalid schema", async () => {
      const invalidSchemas = [null, undefined, 123, "schema", [], false, ""]

      for (const schema of invalidSchemas) {
        await expect(
          gemini("valid content", validPrompt, validMaxTokens, schema)
        ).rejects.toThrow(TypeError)
      }
    })
  })

  describe("successful generation", () => {
    beforeEach(() => {
      // Set up default successful response
      generateObject.mockResolvedValue({ object: { test: "response" } })
    })

    it("should generate structured output successfully", async () => {
      const content = "test content"
      const prompt = "test prompt"
      const maxTokens = 100
      const schema = {
        type: "object",
        properties: { test: { type: "string" } }
      }
      const expectedOutput = { test: "response" }

      const result = await gemini(content, prompt, maxTokens, schema)

      expect(result).toEqual(expectedOutput)
      expect(generateObject).toHaveBeenCalledWith({
        model: mockModel,
        system: prompt,
        prompt: content,
        maxTokens,
        schema
      })
    })

    it("should trim input content and prompt", async () => {
      const content = "  test content  "
      const prompt = "  test prompt  "
      const maxTokens = 100
      const schema = { type: "object" }

      await gemini(content, prompt, maxTokens, schema)

      expect(generateObject).toHaveBeenCalledWith({
        model: mockModel,
        system: "test prompt",
        prompt: "test content",
        maxTokens,
        schema
      })
    })
  })

  describe("error handling", () => {
    it("should throw GeminiError for empty API response", async () => {
      generateObject.mockResolvedValue({ object: null })

      await expect(
        gemini("content", "prompt", 100, { type: "object" })
      ).rejects.toThrow(GeminiError)
    })

    it("should wrap API errors in GeminiError", async () => {
      const apiError = new Error("API Error")
      generateObject.mockRejectedValue(apiError)

      try {
        await gemini("content", "prompt", 100, { type: "object" })
        fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBeInstanceOf(GeminiError)
        expect(error.message).toBe("Failed to generate response")
        expect(error.originalError).toBe(apiError)
      }
    })

    it("should propagate GeminiError without wrapping", async () => {
      const originalError = new GeminiError("Original error")
      generateObject.mockRejectedValue(originalError)

      try {
        await gemini("content", "prompt", 100, { type: "object" })
        fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBe(originalError)
      }
    })

    it("should propagate TypeError without wrapping", async () => {
      const typeError = new TypeError("Type error")
      generateObject.mockRejectedValue(typeError)

      try {
        await gemini("content", "prompt", 100, { type: "object" })
        fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBe(typeError)
      }
    })
  })
})
