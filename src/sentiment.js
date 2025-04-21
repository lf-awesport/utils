const { FieldValue } = require("@google-cloud/firestore")
const { firestore } = require("./firebase.js")
const { jsonSchema } = require("ai")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")
const { sentimentAnalysisPrompt } = require("./prompts.js")
const { gemini } = require("./gemini.js")
require("dotenv").config({ path: require("find-config")(".env") })
const { generateEmbedding } = require("./embeddings.js")

const schema = jsonSchema({
  $schema: "http://json-schema.org/draft-04/schema#",
  type: "object",
  properties: {
    analisi_leggibilita: {
      type: "object",
      properties: {
        punteggio_flesch_kincaid: { type: "integer" },
        tempo_di_lettura_minuti: { type: "integer" },
        spiegazione: { type: "string" }
      },
      required: [
        "punteggio_flesch_kincaid",
        "tempo_di_lettura_minuti",
        "spiegazione"
      ]
    },
    rilevazione_di_pregiudizio: {
      type: "object",
      properties: {
        tipo_di_pregiudizio: { type: "integer" },
        grado_di_pregiudizio: { type: "integer" },
        spiegazione: { type: "string" }
      },
      required: ["tipo_di_pregiudizio", "grado_di_pregiudizio", "spiegazione"]
    },
    rilevazione_emozioni: {
      type: "object",
      properties: {
        emozioni: {
          type: "object",
          properties: {
            gioia: { type: "integer" },
            tristezza: { type: "integer" },
            rabbia: { type: "integer" },
            paura: { type: "integer" },
            sorpresa: { type: "integer" }
          },
          required: ["gioia", "tristezza", "rabbia", "paura", "sorpresa"]
        },
        spiegazione: { type: "string" }
      },
      required: ["emozioni", "spiegazione"]
    },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    takeaways: {
      type: "array",
      items: { type: "string" }
    },
    cleanText: { type: "string" },
    scopo: { type: "string" },
    tesi_principale: { type: "string" },
    concetti_chiave: {
      type: "array",
      items: { type: "string" }
    },
    dominio: { type: "string" },
    tipo_contenuto: { type: "string" },
    contesto_geografico: { type: "string" },
    validita_temporale: { type: "string" },
    target_audience: { type: "string" },
    entita_rilevanti: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "analisi_leggibilita",
    "rilevazione_di_pregiudizio",
    "rilevazione_emozioni",
    "tags",
    "takeaways",
    "cleanText",
    "scopo",
    "tesi_principale",
    "concetti_chiave",
    "dominio",
    "tipo_contenuto",
    "contesto_geografico",
    "validita_temporale",
    "target_audience",
    "entita_rilevanti"
  ]
})

const maxTokens = 8192

const processArticles = async () => {
  try {
    const http = rateLimit(axios.create(), {
      maxRequests: 2,
      perMilliseconds: 60000
    })

    const postsSnap = await firestore
      .collection("posts")
      .where("processed", "==", false)
      .get()

    const total = postsSnap.size
    if (total === 0) {
      console.log("📭 No new posts to process.")
      return
    }

    let batch = firestore.batch()
    let count = 0

    for (const [index, post] of postsSnap.docs.entries()) {
      const postId = post.id
      const postData = post.data()

      console.log(`🔄 Processing ${index + 1}/${total}: ${postId}`)

      try {
        // 1. Analisi semantica
        const analysis = await gemini(
          postData.body,
          sentimentAnalysisPrompt,
          maxTokens,
          schema
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
        const embedding = await generateEmbedding(fullText)

        // 4. Prepara documento per Firestore
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

        // 5. Scrivi su Firestore
        batch.set(firestore.collection("sentiment").doc(postId), newDoc, {
          merge: true
        })
        batch.update(firestore.collection("posts").doc(postId), {
          processed: true
        })
        count++

        // 6. Commit ogni 500 documenti
        if (count % 500 === 0) {
          await batch.commit()
          console.log(`✅ Committed batch of 500 documents`)
          batch = firestore.batch()
        }
      } catch (innerError) {
        console.warn(`⚠️ Skipping article ${postId}: ${innerError.message}`)
      }
    }

    if (count % 500 !== 0) {
      await batch.commit()
    }

    console.log(`🎉 Done! Processed and saved ${count} posts out of ${total}`)
  } catch (error) {
    console.error("❌ Fatal error in processArticles:", error)
  }
}

module.exports = { processArticles }
