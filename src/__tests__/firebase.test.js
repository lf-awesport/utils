const { FirebaseError } = require("../firebase")

describe("Firebase Module", () => {
  const originalEnv = { ...process.env }
  let firebase
  let mockFirestore

  beforeEach(() => {
    // Clear module cache
    jest.resetModules()
    // Reset environment variables
    process.env = {
      ...originalEnv,
      FB_PROJECT_ID: "dashboard-480ed",
      FB_CLIENT_EMAIL: "test@example.com",
      FB_PRIVATE_KEY: "test-key"
    }
    // Mock Firestore class
    mockFirestore = jest.fn().mockImplementation(() => ({
      projectId: process.env.FB_PROJECT_ID
    }))
    jest.mock("@google-cloud/firestore", () => ({
      Firestore: mockFirestore
    }))
    // Get a fresh instance
    firebase = require("../firebase")
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    // Clear module cache
    jest.resetModules()
    // Clear all mocks
    jest.clearAllMocks()
  })

  describe("FirebaseError", () => {
    it("should create error with message", () => {
      const error = new FirebaseError("Test error")
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("FirebaseError")
      expect(error.message).toBe("Test error")
      expect(error.originalError).toBeNull()
    })

    it("should create error with original error", () => {
      const originalError = new Error("Original error")
      const error = new FirebaseError("Test error", originalError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("FirebaseError")
      expect(error.message).toBe("Test error")
      expect(error.originalError).toBe(originalError)
    })
  })

  describe("Firestore Client", () => {
    it("should initialize Firestore client with valid config", () => {
      const client = firebase.firestore
      expect(client).toBeDefined()
      expect(client.projectId).toBe("dashboard-480ed")
      expect(mockFirestore).toHaveBeenCalledWith({
        projectId: "dashboard-480ed",
        credentials: {
          client_email: "test@example.com",
          private_key: "test-key"
        }
      })
    })

    it("should throw FirebaseError when FB_PROJECT_ID is missing", () => {
      delete process.env.FB_PROJECT_ID
      expect(() => firebase.firestore).toThrow("Missing required environment variable: FB_PROJECT_ID")
    })

    it("should throw FirebaseError when FB_CLIENT_EMAIL is missing", () => {
      delete process.env.FB_CLIENT_EMAIL
      expect(() => firebase.firestore).toThrow("Missing required environment variable: FB_CLIENT_EMAIL")
    })

    it("should throw FirebaseError when FB_PRIVATE_KEY is missing", () => {
      delete process.env.FB_PRIVATE_KEY
      expect(() => firebase.firestore).toThrow("Missing required environment variable: FB_PRIVATE_KEY")
    })

    it("should reuse the same client instance", () => {
      const client1 = firebase.firestore
      const client2 = firebase.firestore
      expect(client1).toBe(client2)
      expect(mockFirestore).toHaveBeenCalledTimes(1)
    })

    it("should create a new client instance after reset", () => {
      const client1 = firebase.firestore
      firebase._resetFirestoreClient()
      const client2 = firebase.firestore
      expect(client1).not.toBe(client2)
      expect(mockFirestore).toHaveBeenCalledTimes(2)
    })
  })
}) 