// utils/src/coverPrompt.js
const { firestore } = require("../services/firebase")
const { gemini } = require("../services/gemini")
const { jsonSchema } = require("ai")

/**
 * JSON schema for the Gemini response
 */
const schema = jsonSchema({
  $schema: "http://json-schema.org/draft-04/schema#",
  type: "object",
  properties: {
    answer: {
      type: "string"
    }
  },
  required: ["answer"]
})

/**
 * Genera un prompt per un'immagine di copertina artistica e coerente con il contenuto dell'articolo.
 * Lo stile è sempre originale, astratto, ispirato all'illustrazione digitale moderna, senza riferimenti a marchi o immagini protette.
 * @param {string} articleId - ID dell'articolo su Firestore
 * @returns {Promise<string>} Prompt per generazione immagine
 */
async function generateCoverPromptFromFirebase(articleId) {
  const doc = await firestore.collection("sentiment").doc(articleId).get()
  if (!doc.exists) throw new Error("Articolo non trovato in sentiment")
  const article = doc.data()
  const basePrompt = `Crea un prompt dettagliato per generare un'immagine di copertina artistica, originale e astratta per un modulo didattico universitario sul tema: "${article.title}".\nIspirati all'articolo fornito come contesto}\nStile: illustrazione digitale moderna, colori armoniosi, atmosfera evocativa, senza elementi riconducibili a marchi, loghi, persone reali o immagini protette da copyright. L'immagine deve essere evocativa, simbolica e coerente con il tema trattato, adatta a studenti universitari. Non usare testo o scritte.\nRestituisci solo il prompt finale, massimo 2-3 frasi.`
  const result = await gemini(article.body, basePrompt, 3000, schema)

  console.log("Generated cover prompt:", result)
  return typeof result === "string"
    ? result
    : result.prompt || JSON.stringify(result)
}

module.exports = { generateCoverPromptFromFirebase }

// generateCoverPromptFromFirebase("0.000634700646031538")
