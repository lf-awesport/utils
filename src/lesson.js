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
Sei un esperto di "${materia}" con esperienza nella formazione universitaria. Stai progettando un modulo didattico per studenti universitari sul tema: **"${topic}"**, all'interno del corso di "${materia}".

Livello: **${level.toUpperCase()}**

Contesto reale tratto da articoli e fonti attuali:
${context}

### Obiettivo:
Crea contenuti efficaci per l'apprendimento, adatti al livello indicato, con una struttura chiara, concetti ben spiegati e quiz stimolanti.

### Requisiti dell'output:
Genera un **oggetto JSON** con la seguente struttura:
- levelTitle: un titolo coerente con il livello e il tema (es. "WADA: Le Basi del Sistema Antidoping")
- cards: un array di **5 oggetti**, ciascuno con:
  - title: un titolo breve ma informativo
  - content: una spiegazione **chiara, ben strutturata, originale**, max 100 parole, **evita ripetizioni** tra le card
  - quiz: oggetto con:
    - question: domanda coerente con il contenuto
    - options: 3 opzioni plausibili e non banali
    - correctAnswer: una sola risposta corretta

### Guida alla difficoltà (adatta i contenuti!):
- **EASY** (Livello 1): introduzione generale, definizioni chiave, scopo del tema, comprensione base
- **MEDIUM** (Livello 2): analisi di casi concreti, esempi reali, piccoli scenari applicativi, differenze tra concetti
- **HARD** (Livello 3): valutazione critica, approfondimenti normativi o giuridici, confronti internazionali, errori comuni, implicazioni strategiche

### Stile:
Professionale ma accessibile. Spiega i concetti come se ti rivolgessi a studenti curiosi, non esperti. Evita semplificazioni eccessive, ma non usare linguaggio tecnico eccessivo.

Rispondi solo con un oggetto JSON **valido**, nel formato richiesto. Niente testo fuori dal JSON.
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
