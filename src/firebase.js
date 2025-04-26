const { Firestore } = require("@google-cloud/firestore")
require("dotenv").config({ path: require("find-config")(".env") })

/**
 * Custom error class for Firebase-related errors
 */
class FirebaseError extends Error {
  constructor(message, originalError = null) {
    super(message)
    this.name = "FirebaseError"
    this.originalError = originalError
  }
}

/**
 * Validates the environment configuration
 * @throws {FirebaseError} If required environment variables are missing
 */
function validateConfig() {
  const requiredVars = [
    "FB_PROJECT_ID",
    "FB_CLIENT_EMAIL",
    "FB_PRIVATE_KEY"
  ]

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new FirebaseError(`Missing required environment variable: ${varName}`)
    }
  }
}

/**
 * Creates and initializes the Firestore client
 * @returns {Firestore} Initialized Firestore client
 * @throws {FirebaseError} If initialization fails
 */
function createFirestoreClient() {
  try {
    validateConfig()
    return new Firestore({
      projectId: process.env.FB_PROJECT_ID,
      credentials: {
        //CREATE SERVICE ACCOUNT WITH PERMISSIONS: Cloud Datastore Owner
        // Firebase Admin SDK Administrator Service Agent
        // Service Account Token Creator
        client_email: process.env.FB_CLIENT_EMAIL,
        private_key: process.env.FB_PRIVATE_KEY
      }
    })
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw error
    }
    throw new FirebaseError("Failed to initialize Firestore client", error)
  }
}

// Lazy initialization of the client
let firestoreClient = null

/**
 * Gets or creates the Firestore client
 * @returns {Firestore} The Firestore client
 */
function getFirestoreClient() {
  if (!firestoreClient) {
    firestoreClient = createFirestoreClient()
  }
  return firestoreClient
}

/**
 * Resets the Firestore client (for testing purposes)
 */
function _resetFirestoreClient() {
  firestoreClient = null
}

// Export a getter for the firestore client
Object.defineProperty(module.exports, "firestore", {
  get: () => getFirestoreClient()
})

// Export other functions and classes
module.exports.FirebaseError = FirebaseError
module.exports._resetFirestoreClient = _resetFirestoreClient
