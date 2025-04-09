const { firestore } = require("./firebase") // usa il client @google-cloud/firestore
const { embed } = require("ai")
const { createVertex } = require("@ai-sdk/google-vertex")
const { summarizeContent } = require("./summarize")
const { askAgentPrompt } = require("./prompts")

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

async function queryRAG(userQuestion) {
  // 1. Embedding della domanda
  const { embedding } = await embed({
    model: vertex_ai.textEmbeddingModel(process.env.EMBEDDING_MODEL),
    value: userQuestion
  })

  // 2. Query semantica su Firestore Vector Search
  const snapshot = await firestore
    .collection("sentiment")
    .findNearest({
      vectorField: "embedding",
      queryVector: embedding,
      limit: 10,
      distanceMeasure: "COSINE"
    })
    .get()

  const articles = []
  snapshot.forEach((doc) => {
    const data = doc.data()
    articles.push(data)
  })

  // 3. Costruzione contesto
  const context = articles
    .map((a) => {
      return `
TITOLO: ${a.title}
AUTORE: ${a.author}
DATA: ${a.date}
TAGS: ${Array.isArray(a.tags) ? a.tags.join(", ") : ""}
ESTRATTO: ${a.excerpt}
BODY: ${a.analysis?.cleanText || ""}
`
    })
    .join("\n-----------------------------\n")

  // 4. Chiamata a Gemini con il prompt
  const result = await summarizeContent(context, askAgentPrompt(userQuestion))
  return result
}

module.exports = { queryRAG }
