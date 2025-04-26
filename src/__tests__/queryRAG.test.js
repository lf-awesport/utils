const { generateEmbedding } = require("../embeddings")
const { gemini } = require("../gemini")
const { askAgentPrompt } = require("../prompts")

// Mock external dependencies
jest.mock("../embeddings")
jest.mock("../gemini")
jest.mock("../prompts")

// Mock firebase module with a getter
const mockFirestore = {
  collection: jest.fn()
}
jest.mock("../firebase", () => ({
  get firestore() {
    return mockFirestore
  }
}))

const {
  queryRAG,
  searchSimilarDocuments,
  RAGError,
  DEFAULT_CONFIG
} = require("../queryRAG")

describe("queryRAG", () => {
  // Mock data
  const mockQuery = "test query"
  const mockEmbedding = [0.1, 0.2, 0.3]
  const mockResults = [
    {
      id: "doc1",
      data: {
        title: "Test Title 1",
        author: "Author 1",
        date: "2024-01-01",
        tags: ["tag1", "tag2"],
        excerpt: "Test excerpt 1",
        analysis: { cleanText: "Test body 1" },
        vector_distance: 0.1234
      }
    },
    {
      id: "doc2",
      data: {
        title: "Test Title 2",
        author: "Author 2",
        date: "2024-01-02",
        tags: ["tag3", "tag4"],
        excerpt: "Test excerpt 2",
        analysis: { cleanText: "Test body 2" },
        vector_distance: 0.5678
      }
    }
  ]
  const mockGeminiResponse = { answer: "Test answer" }

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Setup default mock implementations
    generateEmbedding.mockResolvedValue(mockEmbedding)
    gemini.mockResolvedValue(mockGeminiResponse)
    askAgentPrompt.mockReturnValue("test prompt")

    // Setup Firestore mock
    const mockCollection = {
      findNearest: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: mockResults.map((doc) => ({
          id: doc.id,
          data: () => doc.data,
          get: () => doc.data.vector_distance
        }))
      })
    }
    mockFirestore.collection.mockReturnValue(mockCollection)
  })

  describe("searchSimilarDocuments", () => {
    it("should validate input parameters", async () => {
      const invalidInputs = [
        undefined,
        null,
        {},
        { query: "test" },
        { collectionName: "test" },
        { collectionName: null, query: "test" },
        { collectionName: "", query: "test" },
        { collectionName: "test", query: null },
        { collectionName: "test", query: "" },
        { collectionName: "test", query: "test", vectorField: null },
        { collectionName: "test", query: "test", distanceMeasure: "INVALID" },
        { collectionName: "test", query: "test", limit: "not a number" },
        { collectionName: "test", query: "test", limit: 0 },
        { collectionName: "test", query: "test", limit: -1 },
        {
          collectionName: "test",
          query: "test",
          distanceThreshold: "not a number"
        },
        { collectionName: "test", query: "test", filters: "not an array" }
      ]

      for (const input of invalidInputs) {
        await expect(searchSimilarDocuments(input)).rejects.toThrow()
      }
    })

    it("should search documents with default parameters", async () => {
      const results = await searchSimilarDocuments({
        collectionName: "test",
        query: mockQuery
      })

      expect(results).toEqual(mockResults)
      expect(mockFirestore.collection).toHaveBeenCalledWith("test")
      expect(generateEmbedding).toHaveBeenCalledWith(mockQuery)
    })

    it("should search documents with custom parameters", async () => {
      const customParams = {
        collectionName: "test",
        query: mockQuery,
        vectorField: "custom_field",
        distanceMeasure: "EUCLIDEAN",
        limit: 10,
        distanceThreshold: 0.5
      }

      await searchSimilarDocuments(customParams)

      const mockCollection = mockFirestore.collection.mock.results[0].value
      expect(mockCollection.findNearest).toHaveBeenCalledWith({
        vectorField: "custom_field",
        queryVector: mockEmbedding,
        limit: 10,
        distanceMeasure: "EUCLIDEAN",
        distanceResultField: "vector_distance",
        distanceThreshold: 0.5
      })
    })

    it("should handle search errors", async () => {
      const error = new Error("Search failed")
      mockFirestore.collection.mockImplementationOnce(() => {
        throw error
      })

      await expect(
        searchSimilarDocuments({
          collectionName: "test",
          query: mockQuery
        })
      ).rejects.toThrow(RAGError)
    })
  })

  describe("queryRAG", () => {
    it("should validate query input", async () => {
      const invalidQueries = ["", "   ", null, undefined, 123, {}, [], false]

      for (const query of invalidQueries) {
        await expect(queryRAG(query)).rejects.toThrow(TypeError)
      }
    })

    it("should process RAG query successfully", async () => {
      const result = await queryRAG(mockQuery)

      expect(result).toEqual({
        text: mockGeminiResponse,
        sources: mockResults.map(({ id, data }) => {
          const { analysis, ...rest } = data
          const { cleanText, ...analysisRest } = analysis
          return {
            id,
            ...rest,
            analysis: analysisRest
          }
        }),
        query: mockQuery
      })

      expect(generateEmbedding).toHaveBeenCalledWith(mockQuery)
      expect(gemini).toHaveBeenCalledWith(
        expect.stringContaining("Test Title 1"),
        expect.any(String),
        DEFAULT_CONFIG.maxTokens,
        expect.any(Object)
      )
    })

    it("should handle empty search results", async () => {
      const mockEmptyCollection = {
        findNearest: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] })
      }
      mockFirestore.collection.mockReturnValue(mockEmptyCollection)

      const result = await queryRAG(mockQuery)

      expect(result.sources).toEqual([])
      expect(gemini).toHaveBeenCalledWith(
        "",
        expect.any(String),
        DEFAULT_CONFIG.maxTokens,
        expect.any(Object)
      )
    })

    it("should handle missing optional fields in documents", async () => {
      const mockIncompleteResults = [
        {
          id: "doc1",
          data: {
            title: "Test Title 1",
            analysis: { cleanText: "Test body 1" },
            vector_distance: 0.1234
          }
        }
      ]

      const mockIncompleteCollection = {
        findNearest: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: mockIncompleteResults.map((doc) => ({
            id: doc.id,
            data: () => doc.data,
            get: () => doc.data.vector_distance
          }))
        })
      }
      mockFirestore.collection.mockReturnValue(mockIncompleteCollection)

      const result = await queryRAG(mockQuery)

      expect(result.sources[0]).toEqual({
        id: "doc1",
        title: "Test Title 1",
        vector_distance: 0.1234,
        analysis: {}
      })
    })

    it("should handle Gemini errors", async () => {
      const error = new Error("Gemini error")
      gemini.mockRejectedValueOnce(error)

      await expect(queryRAG(mockQuery)).rejects.toThrow(RAGError)
    })

    it("should handle embedding generation errors", async () => {
      const error = new Error("Embedding error")
      generateEmbedding.mockRejectedValueOnce(error)

      await expect(queryRAG(mockQuery)).rejects.toThrow(RAGError)
    })
  })
})
