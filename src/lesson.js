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

const promptTemplate = (level, topic, materia) => {
  const levelInstructions = {
    easy: `
🔰 Questo è un livello EASY. Il contenuto deve essere introduttivo, pensato per chi si avvicina per la prima volta al diritto sportivo.
- Spiega concetti base in modo semplice: cos'è l'ordinamento sportivo, cosa fa il CONI, cosa significa "giurisdizione sportiva", ecc.
- Evita dettagli normativi o giurisprudenziali complessi.
`,
    medium: `
⚖️ Questo è un livello MEDIUM. Il contenuto deve essere applicato e concreto, rivolto a studenti con una base giuridica.
- Introduci norme specifiche, esempi reali, regolamenti (es. WADA, Codice Giustizia Sportiva), ricorsi, sanzioni, ruolo degli organi (es. CAS).
- Usa casi reali per spiegare i concetti, ma con chiarezza didattica.
`,
    hard: `
🧠 Questo è un livello HARD. Il contenuto deve essere critico e avanzato, pensato per studenti in grado di analizzare giuridicamente.
- Affronta dilemmi interpretativi, analizza sentenze, falle normative, autonomie in conflitto, principi UE vs norme sportive.
- Stimola riflessione: cosa dice la giurisprudenza? Ci sono contraddizioni? Quali sono le implicazioni?
`
  }

  return `
Sei un esperto di **Diritto Sportivo** (Sports Law) e docente universitario. Devi progettare un modulo didattico per studenti universitari sul tema: **"${topic}"**, all'interno del corso di "${materia}".

### Livello: ${level.toUpperCase()}
${levelInstructions[level]}

### Contesto:
Hai a disposizione una raccolta di fonti, articoli e casi reali tratti dal mondo dello sport e della giustizia sportiva:

### Obiettivo:
Aiuta gli studenti a comprendere concetti giuridici chiave legati al diritto sportivo. Crea contenuti originali e coerenti con il livello indicato, utilizzando riferimenti concreti al mondo dello sport, alla normativa vigente e agli organismi di controllo (es. WADA, CAS, FIFA, CONI, FIGC, IOC).

### Requisiti dell'output:
Restituisci un **oggetto JSON** con questa struttura:
- levelTitle: titolo coerente con il livello e il focus giuridico
- cards: 5 schede, ciascuna con:
  - title
  - content (max 100 parole)
  - quiz (con 3 opzioni, 1 corretta)

### Stile:
Professionale e accessibile. Coinvolgi studenti di giurisprudenza o management sportivo. Usa un linguaggio chiaro ma rigoroso.

❗ Restituisci solo l'oggetto JSON. Nessun testo aggiuntivo.
`
}

async function generateLearningModule({ topic, materia, lessonId }) {
  try {
    // 1. Cerca articoli rilevanti
    const context = await searchSimilarDocuments({
      query: topic,
      collectionName: "sentiment",
      distanceMeasure: "COSINE",
      limit: 25
    })

    const contextString = context
      .map(({ data }) => data.analysis?.cleanText || "")
      .join("\n---\n")

    const imgLink = context.find((r) => r.data.imgLink)?.data?.imgLink || null

    const easy = await gemini(
      contextString,
      promptTemplate("easy", topic, materia),
      8192,
      levelSchema
    )
    const medium = await gemini(
      contextString,
      promptTemplate("medium", topic, materia),
      8192,
      levelSchema
    )
    const hard = await gemini(
      contextString,
      promptTemplate("hard", topic, materia),
      8192,
      levelSchema
    )

    //new call to fix everything?

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
      topic:
        "Il caso Sinner e il controllo antidoping: ruolo e limiti del sistema WADA",
      materia: "Sports Law",
      lessonId: "sinner-wada-quiz-module"
    },
    {
      topic:
        "Nicolò Fagioli e le scommesse sportive: disciplina, sanzioni e giurisdizione",
      materia: "Sports Law",
      lessonId: "fagioli-scommesse-quiz-module"
    },
    {
      topic:
        "Ultras, mafia e responsabilità nel calcio italiano: tra ordine pubblico e autonomia sportiva",
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
