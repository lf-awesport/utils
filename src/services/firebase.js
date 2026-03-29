/**
 * @fileoverview Firebase Integration Service
 * Manages Google Cloud Firestore initialization and authentication config.
 * @module firebaseService
 */
const { Firestore } = require("@google-cloud/firestore")
const { config, requireEnv } = require("../config")

const { AppError } = require("../errors")

/**
 * Custom error wrapper for Firestore specific failures.
 * @extends AppError
 */
class FirebaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, { status: 500, code: "DATABASE_ERROR", details: originalError })
    this.name = "FirebaseError"
  }
}

/**
 * Validates the environment configuration matches required GCP standards.
 * @throws {FirebaseError} If expected environment variables are missing.
 */
function validateConfig() {
  requireEnv(
    ["FB_PROJECT_ID", "FB_CLIENT_EMAIL", "FB_PRIVATE_KEY"],
    (msg) => new FirebaseError(msg)
  )
}

/**
 * Instantiates the actual Firestore client using environment keys.
 * @returns {Firestore} Initialized database interface.
 * @throws {FirebaseError} Under configuration exceptions.
 */
function createFirestoreClient() {
  try {
    validateConfig()
    return new Firestore({
      projectId: config.firebase.projectId,
      credentials: {
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

// Global cached client instance for lazy initialization.
let firestoreClient = null

/**
 * Retrieves the cached or newly configured Firestore database object.
 * @returns {Firestore}
 */
function getFirestoreClient() {
  if (!firestoreClient) {
    firestoreClient = createFirestoreClient()
  }
  return firestoreClient
}

/**
 * Disconnects and resets internal client state (primarily for test setups).
 */
function _resetFirestoreClient() {
  firestoreClient = null
}

// Surface firestore property as a dynamic getter resolving connections just-in-time.
Object.defineProperty(module.exports, "firestore", {
  get: () => getFirestoreClient()
})

module.exports.FirebaseError = FirebaseError
module.exports._resetFirestoreClient = _resetFirestoreClient
