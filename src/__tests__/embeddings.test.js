const { embed } = require("ai")
const { createVertex } = require("@ai-sdk/google-vertex")
const {
  generateEmbedding,
  EmbeddingError,
  DEFAULT_CONFIG,
  createVertexClient,
  _resetVertexClient,
  updateConfig
} = require("../embeddings")

// Mock external dependencies
jest.mock("ai")
jest.mock("@ai-sdk/google-vertex")

describe("embeddings", () => {
  // Mock data
  const mockEmbedding = [0.1, 0.2, 0.3]
  const mockText = "test text"
  const mockModel = {
    textEmbeddingModel: jest.fn().mockReturnValue("mock-model")
  }

  // Store original env
  const originalEnv = process.env

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset the Vertex client
    _resetVertexClient()

    // Setup default mock implementations
    embed.mockResolvedValue({ embedding: mockEmbedding })
    createVertex.mockReturnValue(mockModel)

    // Setup environment variables
    process.env = {
      ...originalEnv,
      PROJECT_ID: "test-project",
      LOCATION: "test-location",
      EMBEDDING_MODEL: "test-model",
      CLIENT_EMAIL: "test@example.com",
      PRIVATE_KEY: "test-key"
    }
  })

  afterEach(() => {
    // Restore original env
    process.env = originalEnv
  })

  describe("generateEmbedding", () => {
    it("should generate embeddings successfully", async () => {
      const result = await generateEmbedding(mockText)

      expect(result).toEqual(mockEmbedding)
      expect(embed).toHaveBeenCalledWith({
        model: "mock-model",
        value: mockText
      })
      expect(mockModel.textEmbeddingModel).toHaveBeenCalledWith("test-model")
    })

    it("should throw TypeError for non-string input", async () => {
      const invalidInputs = [null, undefined, 123, {}, [], true]

      for (const input of invalidInputs) {
        await expect(generateEmbedding(input)).rejects.toThrow(TypeError)
        await expect(generateEmbedding(input)).rejects.toThrow(
          "Input text must be a string"
        )
      }
    })

    it("should throw TypeError for empty string input", async () => {
      const emptyInputs = ["", "   ", "\n", "\t"]

      for (const input of emptyInputs) {
        await expect(generateEmbedding(input)).rejects.toThrow(TypeError)
        await expect(generateEmbedding(input)).rejects.toThrow(
          "Input text cannot be empty"
        )
      }
    })

    it("should throw EmbeddingError for invalid API response", async () => {
      const invalidResponses = [
        { embedding: null },
        { embedding: undefined },
        { embedding: "not-an-array" },
        { embedding: {} },
        {}
      ]

      for (const response of invalidResponses) {
        embed.mockReset() // Reset the mock
        embed.mockResolvedValueOnce(response) // Set up the next response
        await expect(generateEmbedding(mockText)).rejects.toThrow(
          EmbeddingError
        )
        await expect(generateEmbedding(mockText)).rejects.toThrow(
          "Failed to generate embedding"
        )
      }
    })

    it("should throw EmbeddingError when API call fails", async () => {
      const apiError = new Error("API error")
      embed.mockReset() // Reset the mock
      embed.mockRejectedValueOnce(apiError) // Set up the rejection

      await expect(generateEmbedding(mockText)).rejects.toThrow(EmbeddingError)
      await expect(generateEmbedding(mockText)).rejects.toThrow(
        "Failed to generate embedding"
      )
    })

    it("should throw EmbeddingError when required environment variables are missing", async () => {
      const requiredVars = [
        "PROJECT_ID",
        "LOCATION",
        "EMBEDDING_MODEL",
        "CLIENT_EMAIL",
        "PRIVATE_KEY"
      ]

      for (const varName of requiredVars) {
        _resetVertexClient() // Reset client before each test
        const originalValue = process.env[varName]
        delete process.env[varName]

        await expect(generateEmbedding(mockText)).rejects.toThrow(
          EmbeddingError
        )
        await expect(generateEmbedding(mockText)).rejects.toThrow(
          "Missing required environment variable"
        )

        process.env[varName] = originalValue
      }
    })
  })

  describe("Vertex AI Client Initialization", () => {
    it("should throw EmbeddingError when required environment variables are missing", () => {
      process.env = {}
      _resetVertexClient() // Reset client before test

      expect(() => createVertexClient()).toThrow(EmbeddingError)
      expect(() => createVertexClient()).toThrow(
        "Missing required environment variable"
      )
    })

    it("should throw EmbeddingError when Vertex AI client creation fails", () => {
      const error = new Error("Failed to create client")
      createVertex.mockImplementationOnce(() => {
        throw error
      })
      _resetVertexClient() // Reset client before test

      try {
        createVertexClient()
        fail("Expected createVertexClient to throw")
      } catch (e) {
        expect(e).toBeInstanceOf(EmbeddingError)
        expect(e.message).toBe("Failed to initialize Vertex AI client")
        expect(e.originalError).toBe(error)
      }
    })

    it("should create Vertex AI client with correct configuration", () => {
      createVertexClient()

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
    })
  })

  describe("Error Handling", () => {
    it("should preserve original error in EmbeddingError", async () => {
      const originalError = new Error("Original error")
      _resetVertexClient() // Reset client
      embed.mockReset() // Reset the mock
      embed.mockRejectedValueOnce(originalError) // Set up the rejection

      try {
        await generateEmbedding(mockText)
        fail("Expected an error to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError)
        expect(error.originalError).toBe(originalError)
      }
    })

    it("should propagate TypeError without wrapping", async () => {
      const typeError = new TypeError("Invalid input")
      embed.mockReset() // Reset the mock
      embed.mockImplementationOnce(() => {
        throw typeError
      })

      await expect(generateEmbedding(mockText)).rejects.toThrow(TypeError)
    })
  })
})
