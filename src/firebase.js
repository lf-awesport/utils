const { Firestore } = require("@google-cloud/firestore")
require("dotenv").config({ path: require("find-config")(".env") })

const firestore = new Firestore({
  projectId: process.env.FB_PROJECT_ID,
  credentials: {
    //CREATE SERVICE ACCOUNT WITH PERMISSIONS: Cloud Datastore Owner
    // Firebase Admin SDK Administrator Service Agent
    // Service Account Token Creator
    client_email: process.env.FB_CLIENT_EMAIL,
    private_key: process.env.FB_PRIVATE_KEY
  }
})

module.exports.firestore = firestore
