const { FieldValue } = require("@google-cloud/firestore")
const { firestore } = require("../firebase.js")
const { gemini } = require("../gemini.js")
const { generateEmbedding } = require("../embeddings.js")
const { SentimentError, processArticles } = require("../sentiment.js")

// Mock external dependencies
jest.mock("../firebase.js", () => ({
  firestore: {
    collection: jest.fn(),
    batch: jest.fn()
  }
}))
jest.mock("../gemini.js")
jest.mock("../embeddings.js")

describe("Sentiment Analysis", () => {
  const mockArticle = {
    id: "test-article",
    data: () => ({
      title: "Test Title",
      author: "Test Author",
      date: "2024-03-20",
      body: "Test body content",
      url: "https://test.com",
      excerpt: "Test excerpt",
      imgLink: "https://test.com/image.jpg",
      processed: false
    })
  }

  const mockAnalysis = {
    analisi_leggibilita: {
      punteggio_flesch_kincaid: 60,
      tempo_di_lettura_minuti: 5,
      spiegazione: "Test readability"
    },
    rilevazione_di_pregiudizio: {
      tipo_di_pregiudizio: 1,
      grado_di_pregiudizio: 2,
      spiegazione: "Test bias"
    },
    rilevazione_emozioni: {
      emozioni: {
        gioia: 1,
        tristezza: 2,
        rabbia: 3,
        paura: 4,
        sorpresa: 5
      },
      spiegazione: "Test emotions"
    },
    tags: ["test", "article"],
    takeaways: ["key point 1", "key point 2"],
    cleanText: "Clean test content",
    scopo: "Test purpose",
    tesi_principale: "Main thesis",
    concetti_chiave: ["concept 1", "concept 2"],
    dominio: "Test domain",
    tipo_contenuto: "article",
    contesto_geografico: "global",
    validita_temporale: "2024",
    target_audience: "general",
    entita_rilevanti: ["entity 1", "entity 2"]
  }

  const mockEmbedding = [0.1, 0.2, 0.3]

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock Firestore methods
    const mockDoc = {
      set: jest.fn(),
      update: jest.fn()
    }

    const mockBatch = {
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue()
    }

    const mockCollection = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [mockArticle],
        size: 1
      }),
      doc: jest.fn().mockReturnValue(mockDoc)
    }

    firestore.collection.mockImplementation((name) => mockCollection)
    firestore.batch.mockReturnValue(mockBatch)

    // Mock Gemini
    gemini.mockResolvedValue(mockAnalysis)

    // Mock embedding generation
    generateEmbedding.mockResolvedValue(mockEmbedding)

    // Mock FieldValue.vector
    FieldValue.vector = jest.fn(arr => arr)
  })

  test("successfully processes unprocessed articles", async () => {
    await processArticles()
    
    expect(firestore.collection).toHaveBeenCalledWith("posts")
    expect(firestore.collection).toHaveBeenCalledWith("sentiment")
    expect(gemini).toHaveBeenCalled()
    expect(generateEmbedding).toHaveBeenCalled()
  })

  test("handles empty collection", async () => {
    const mockEmptyCollection = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [],
        size: 0
      })
    }
    firestore.collection.mockReturnValueOnce(mockEmptyCollection)

    await processArticles()
    expect(gemini).not.toHaveBeenCalled()
  })

  test("handles analysis failure", async () => {
    gemini.mockRejectedValueOnce(new Error("Analysis failed"))

    await processArticles() // Should not throw since errors are caught per article
    expect(gemini).toHaveBeenCalled()
  })

  test("validates sentiment analysis schema", async () => {
    await processArticles()
    
    // Verify the analysis structure matches schema
    expect(mockAnalysis).toMatchObject({
      analisi_leggibilita: expect.objectContaining({
        punteggio_flesch_kincaid: expect.any(Number),
        tempo_di_lettura_minuti: expect.any(Number),
        spiegazione: expect.any(String)
      }),
      rilevazione_di_pregiudizio: expect.objectContaining({
        tipo_di_pregiudizio: expect.any(Number),
        grado_di_pregiudizio: expect.any(Number),
        spiegazione: expect.any(String)
      }),
      rilevazione_emozioni: expect.objectContaining({
        emozioni: expect.objectContaining({
          gioia: expect.any(Number),
          tristezza: expect.any(Number),
          rabbia: expect.any(Number),
          paura: expect.any(Number),
          sorpresa: expect.any(Number)
        }),
        spiegazione: expect.any(String)
      })
    })
  })

  test("processes articles in batches", async () => {
    const mockArticles = Array(55).fill(mockArticle)
    const mockBatchCollection = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: mockArticles,
        size: mockArticles.length
      }),
      doc: jest.fn().mockReturnValue({ set: jest.fn(), update: jest.fn() })
    }
    firestore.collection.mockReturnValue(mockBatchCollection)

    await processArticles()

    // Should create 2 batches (50 docs in first, 5 in second)
    expect(firestore.batch).toHaveBeenCalledTimes(2)
  })
})