const { collection, getDocs, setDoc, doc } = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")
const { createVertex } = require("@ai-sdk/google-vertex")
const { embed, cosineSimilarity } = require("ai")
const { sentimentAnalysisPrompt } = require("./prompts")
const { summarizeContent } = require("./summarize.js")
require("dotenv").config({ path: require("find-config")(".env") })

// Initialize Vertex AI client
const vertex_ai = createVertex({
  project: process.env.PROJECT_ID,
  location: process.env.LOCATION,
  googleAuthOptions: {
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY
    }
  }
})

/**
 * 🔹 Single Async Function: Processes Articles → Generates Embeddings → Gets Sentiment Analysis
 */
const processArticles = async () => {
  try {
    // Setup Axios with rate limiting (max 2 requests per 60 sec)
    const http = rateLimit(axios.create(), {
      maxRequests: 2,
      perMilliseconds: 60000
    })

    // Fetch existing articles & sentiment data
    const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
    const alreadyDoneSnap = await getDocs(collection(firebaseApp, "sentiment"))

    let alreadyDone = new Set()
    alreadyDoneSnap.forEach((doc) => alreadyDone.add(doc.id))

    // Iterate through articles
    for (const post of dbSnapshot.docs) {
      const postId = post.id
      if (alreadyDone.has(postId)) continue // Skip if already processed

      console.log(`Processing article: ${postId}`)

      // Fetch article data
      const postData = post.data()
      // 🔹 Generate Embedding using Vercel AI SDK (Google Vertex)

      const { embedding } = await embed({
        model: vertex_ai.textEmbeddingModel(
          "textembedding-gecko-multilingual@latest"
        ), // Official Google Vertex embedding model
        value: postData.body
      })

      // 🔹 Fetch Sentiment Analysis (if not exists)
      const analysis = await summarizeContent(
        postData.body,
        sentimentAnalysisPrompt
      )

      // 🔹 Store embedding & sentiment in Firestore
      const newDoc = {
        id: postId,
        embedding,
        analysis,
        prejudice: analysis?.rilevazione_di_pregiudizio?.grado_di_pregiudizio,
        readability: analysis?.analisi_leggibilità?.punteggio_flesch_kincaid,
        tags: analysis?.tags,
        url: postData.url,
        excerpt: postData.excerpt,
        imgLink: postData.imgLink,
        title: postData.title,
        date: postData.date,
        author: postData.author
      }
      await setDoc(doc(firebaseApp, "sentiment", postId), newDoc, {
        merge: true
      })
      console.log(`✅ Processed article: ${postId}`)
    }
  } catch (error) {
    console.error("❌ Error processing articles:", error)
  }
}

// Run the function immediately (if needed)
processArticles()

module.exports = { processArticles }
