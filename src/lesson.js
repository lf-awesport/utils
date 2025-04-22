const { firestore } = require("./firebase")
const { jsonSchema } = require("ai")
const { gemini } = require("./gemini")
const { searchSimilarDocuments } = require("./queryRAG")

const levelSchema = jsonSchema({
  type: "object",
  required: ["levelTitle", "cards"],
  properties: {
    levelTitle: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "content", "quiz"],
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          quiz: {
            type: "object",
            required: ["question", "options", "correctAnswer"],
            properties: {
              question: { type: "string" },
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string" }
              },
              correctAnswer: { type: "string" }
            }
          }
        }
      }
    }
  }
})

const promptTemplate = (level, topic, materia, context) => `
Sei un esperto di "${materia}" e formatore per studenti universitari.

Stai creando un modulo didattico per il livello **${level.toUpperCase()}** sul tema: "${topic}".

Contesto reale tratto da articoli:
${context}

Genera un oggetto JSON con i seguenti campi:
- levelTitle: un titolo descrittivo del livello (es. "Introduzione al sistema WADA")
- cards: un array di 5 oggetti, ognuno con:
  - title: titolo breve
  - content: spiegazione semplice e accessibile (max 100 parole)
  - quiz: domanda legata al contenuto con 3 opzioni e 1 risposta corretta

Adatta la difficoltà al livello:
- EASY = introduzione base, definizioni, contesto semplice
- MEDIUM = esempi reali, concetti più articolati, applicazione
- HARD = approfondimento tecnico, confronto, errori comuni, analisi critica

Rispondi solo con un oggetto JSON nel formato richiesto.
`

async function generateLearningModule({ topic, materia, lessonId }) {
  try {
    // 1. Cerca articoli rilevanti
    const context = await searchSimilarDocuments({
      query: topic,
      collectionName: "sentiment",
      distanceMeasure: "COSINE",
      limit: 25
    })

    const imgLink = context.find((r) => r.data.imgLink)?.data?.imgLink || null

    // 2. Genera i livelli
    const easy = await gemini(
      promptTemplate("easy", topic, materia, context),
      null,
      2048,
      levelSchema
    )
    const medium = await gemini(
      promptTemplate("medium", topic, materia, context),
      null,
      2048,
      levelSchema
    )
    const hard = await gemini(
      promptTemplate("hard", topic, materia, context),
      null,
      2048,
      levelSchema
    )

    const moduleDoc = {
      topic,
      materia,
      createdAt: new Date(),
      cover: imgLink,
      levels: {
        easy,
        medium,
        hard
      }
    }

    await firestore
      .collection("learningModules")
      .doc(materia)
      .collection("lessons")
      .doc(lessonId)
      .set(moduleDoc)

    return moduleDoc.levels
  } catch (error) {
    console.error("❌ Errore durante la generazione delle carte:", error)
    return null
  }
}

module.exports = { generateLearningModule }

async function createDefaultModules() {
  const modules = [
    {
      topic: "Il caso Sinner e il sistema WADA",
      materia: "Sports Law",
      lessonId: "sinner-wada-quiz-module"
    },
    {
      topic: "Il caso Fagioli e il fenomeno delle scommesse nel calcio",
      materia: "Sports Law",
      lessonId: "fagioli-scommesse-quiz-module"
    },
    {
      topic: "Infiltrazioni mafiose tra Ultras e club calcistici a Milano",
      materia: "Sports Law",
      lessonId: "ultras-mafia-quiz-module"
    }
  ]

  for (const module of modules) {
    console.log(`\u{1F4DA} Generando modulo: ${module.lessonId}`)
    const result = await generateLearningModule(module)
    if (result) {
      console.log(`\u{2705} Modulo ${module.lessonId} generato con successo!`)
    } else {
      console.warn(
        `\u{26A0}\u{FE0F} Errore nella generazione di ${module.lessonId}`
      )
    }
  }
}

module.exports = { createDefaultModules }

// Esecuzione immediata (facoltativa)
// createDefaultModules()
