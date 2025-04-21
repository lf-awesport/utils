const { embed } = require("ai")
const { createVertex } = require("@ai-sdk/google-vertex")

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
 * 🔠 Genera l'embedding di una query testuale con Vertex AI
 * @param {string} text - Testo della query da trasformare in embedding
 * @returns {Promise<number[]>} - Vettore embedding
 */
async function generateEmbedding(text) {
  const { embedding } = await embed({
    model: vertex_ai.textEmbeddingModel(process.env.EMBEDDING_MODEL),
    value: text
  })
  return embedding
}

module.exports = {
  generateEmbedding
}
