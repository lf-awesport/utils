const { FieldValue } = require("@google-cloud/firestore")
const { firestore } = require("./firebase.js")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")
const { createVertex } = require("@ai-sdk/google-vertex")
const { embed } = require("ai")
const { sentimentAnalysisPrompt } = require("./prompts.js")
const { summarizeContent } = require("./summarize.js")
require("dotenv").config({ path: require("find-config")(".env") })

// Initialize Vertex AI clientA
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
 * 🔁 Processa nuovi articoli da "posts", li arricchisce e li salva in "sentiment"
 */
const processArticles = async () => {
  try {
    const http = rateLimit(axios.create(), {
      maxRequests: 2,
      perMilliseconds: 60000
    })

    const postsSnap = await firestore.collection("posts").get()
    const sentimentSnap = await firestore.collection("sentiment").get()

    const alreadyDone = new Set()
    sentimentSnap.forEach((doc) => alreadyDone.add(doc.id))
    console.log(alreadyDone.size)

    for (const post of postsSnap.docs) {
      const postId = post.id
      if (alreadyDone.has(postId)) continue

      console.log(`🚀 Processing article: ${postId}`)
      const postData = post.data()

      try {
        // 1. Analisi semantica
        const analysis = await summarizeContent(
          postData.body,
          sentimentAnalysisPrompt
        )

        if (!analysis || !analysis.analisi_leggibilita) {
          throw new Error("Invalid or incomplete analysis")
        }

        // 2. Prepara il contenuto completo per l'embedding
        const fullText = `
TITOLO: ${postData.title}
AUTORE: ${postData.author}
DATA: ${postData.date}
TAGS: ${Array.isArray(analysis?.tags) ? analysis.tags.join(", ") : ""}
ESTRATTO: ${postData.excerpt}
BODY: ${postData.body}
---
ANALISI:
${JSON.stringify(analysis)}
`.trim()

        // 3. Genera embedding
        const { embedding } = await embed({
          model: vertex_ai.textEmbeddingModel(process.env.EMBEDDING_MODEL),
          value: fullText
        })

        // 4. Salva tutto su Firestore
        const newDoc = {
          id: postId,
          embedding: FieldValue.vector(embedding),
          analysis,
          prejudice: analysis?.rilevazione_di_pregiudizio?.grado_di_pregiudizio,
          readability: analysis?.analisi_leggibilita?.punteggio_flesch_kincaid,
          tags: analysis?.tags,
          url: postData.url,
          excerpt: postData.excerpt,
          imgLink: postData.imgLink,
          title: postData.title,
          date: postData.date,
          author: postData.author
        }

        await firestore.collection("sentiment").doc(postId).set(newDoc, {
          merge: true
        })

        console.log(`✅ Saved enriched article: ${postId}`)
      } catch (innerError) {
        console.warn(`⚠️ Skipping article ${postId}: ${innerError.message}`)
      }
    }
  } catch (error) {
    console.error("❌ Fatal error in processArticles:", error)
  }
}

module.exports = { processArticles }

// Run the function immediately (if needed)
// processArticles()
