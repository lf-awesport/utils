const { Firestore } = require("@google-cloud/firestore")
const { config, requireEnv } = require("../config")

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
  requireEnv(
    ["FB_PROJECT_ID", "FB_CLIENT_EMAIL", "FB_PRIVATE_KEY"],
    (msg) => new FirebaseError(msg)
  )
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
      projectId: config.firebase.projectId,
      credentials: {
        //CREATE SERVICE ACCOUNT WITH PERMISSIONS: Cloud Datastore Owner
        // Firebase Admin SDK Administrator Service Agent
        // Service Account Token Creator
        client_email: config.firebase.clientEmail,
        private_key: config.firebase.privateKey
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
