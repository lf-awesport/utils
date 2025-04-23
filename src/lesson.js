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
Sei un esperto di **Diritto Sportivo** (Sports Law) e docente universitario. Devi progettare un modulo didattico per studenti universitari sul tema: **"${topic}"**, all'interno del corso di "${materia}".

### Contesto:
Hai a disposizione una raccolta di fonti, articoli e casi reali tratti dal mondo dello sport e della giustizia sportiva:
${context}

### Obiettivo:
Aiuta gli studenti a comprendere concetti giuridici chiave legati al diritto sportivo. Crea contenuti originali e coerenti con il livello indicato, utilizzando riferimenti concreti al mondo dello sport, alla normativa vigente e agli organismi di controllo (es. WADA, CAS, FIFA, CONI, FIGC, IOC).

### Requisiti dell'output:
Restituisci un **oggetto JSON** con questa struttura:
- levelTitle: titolo coerente con il livello e il focus giuridico (es. "Il Codice WADA: principi e limiti")
- cards: 5 schede, ciascuna con:
  - title: titolo breve ma informativo
  - content: spiegazione originale, chiara e precisa, **massimo 100 parole**, evitando ripetizioni
  - quiz:
    - question: una domanda coerente con il contenuto
    - options: 3 opzioni plausibili
    - correctAnswer: la risposta corretta

### Livelli:
- **EASY** = introduzione ai concetti base: giustizia sportiva, enti regolatori, ruolo del diritto nello sport, codice etico
- **MEDIUM** = applicazioni reali e casi studio: sanzioni disciplinari, ricorsi al TAS/CAS, doping, normativa nazionale e internazionale
- **HARD** = analisi critica: conflitti giurisdizionali, vuoti normativi, analisi di sentenze, riflessioni etico-giuridiche, interpretazioni controverse

### Stile:
Professionale e accessibile. Coinvolgi studenti di giurisprudenza o management sportivo. Spiega in modo semplice ma preciso. Usa il linguaggio del diritto sportivo, ma evita tecnicismi eccessivi.

❗ Restituisci solo l'oggetto JSON nel formato richiesto. Nessun testo aggiuntivo.
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
      topic: "Il caso Mafia & Ultras Curva a Milano",
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
