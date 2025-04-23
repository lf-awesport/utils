const { firestore } = require("./firebase")
const { z } = require("zod")
const { gemini } = require("./gemini")
const { searchSimilarDocuments } = require("./queryRAG")

const levelSchema = z.object({
  levelTitle: z.string(),
  cards: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      quiz: z.object({
        question: z.string(),
        options: z.array(z.string()).min(3).max(3),
        correctAnswer: z.string()
      })
    })
  )
})

const reviewSchema = z.object({
  easy: levelSchema,
  medium: levelSchema,
  hard: levelSchema
})

const levelInstructions = {
  easy: `\n🔰 EASY – Introduzione ai concetti base del diritto sportivo.\n- Definisci termini fondamentali (es. ordinamento sportivo, CONI, giurisdizione sportiva).\n- Spiega in modo semplice, con esempi concreti ma basilari.\n- NON introdurre norme specifiche o casi complessi.`,
  medium: `\n⚖️ MEDIUM – Applicazioni pratiche e riferimenti normativi.\n- Focalizzati su regolamenti (es. WADA, Codice di Giustizia Sportiva), ruoli di organi e sanzioni.\n- Fai riferimento a casi reali, ma spiegandoli in modo chiaro.\n- NON ripetere concetti introdotti nell’EASY.`,
  hard: `\n🧠 HARD – Approccio critico e avanzato.\n- Analizza dilemmi interpretativi, contraddizioni normative, giurisprudenza e principi UE.\n- Stimola la riflessione giuridica con domande aperte.\n- NON ripetere quanto già spiegato nei livelli precedenti.`
}

const promptTemplate = ({
  level,
  topic,
  materia,
  contextString,
  previousOutput = null
}) => {
  const additionalContext = previousOutput
    ? `\n### Output del livello precedente:\n${JSON.stringify(previousOutput)}\n\n❗ Evita ripetizioni. Approfondisci nuovi aspetti coerenti con il livello attuale.\n`
    : ""

  return `
Sei un esperto di Diritto Sportivo e docente universitario. Devi progettare un modulo didattico sul tema **\"${topic}\"**, per il corso di \"${materia}\".

### Livello: ${level.toUpperCase()}
${levelInstructions[level]}

${additionalContext}

### Contesto (articoli e fonti reali):
${contextString.slice(0, 4000)}...

### Obiettivo:
Aiuta gli studenti a comprendere concetti chiave del diritto sportivo, in modo coerente con il livello di difficoltà.

### Requisiti output:
Restituisci un **oggetto JSON**:
- levelTitle: titolo del livello
- cards: 3 schede, ognuna con:
  - title
  - content (max 100 parole)
  - quiz: 3 opzioni, 1 corretta

### Stile:
Professionale e accessibile. Linguaggio chiaro, rigoroso, adatto a studenti universitari.

✅ Checklist prima di rispondere:
- Ogni livello deve approfondire aspetti differenti.
- Le card devono trattare temi complementari e non ridondanti.
- Il livello HARD può criticare o problematizzare i contenuti dei precedenti.

❗ Rispondi solo con l’oggetto JSON.
`
}

const reviewPrompt = ({ topic, materia, fullDraft }) => `
Sei un esperto di Diritto Sportivo e instructional designer per moduli educativi.

Hai ricevuto una bozza completa di un modulo didattico sul tema: **\"${topic}\"**, per il corso di \"${materia}\". La bozza è divisa in 3 livelli: EASY, MEDIUM, HARD.

### Il tuo compito:
- Rivedi **interamente** il modulo.
- Per ogni livello:
  - Riformula il **levelTitle** per renderlo più breve e **specifico e coerente** con i contenuti delle carte.
  - Mescola bene **l’ordine delle opzioni del quiz**, mantenendo invariata la risposta corretta.
  - Mantieni solo 3 cards per livello per evitare ripetizioni tra livelli e ridondanze e ripetizioni
  - Migliora lo stile e la chiarezza se necessario.
- NON aggiungere nuovi contenuti, ma migliora la coerenza e varietà.
- NON ripetere concetti già trattati in altri livelli.

❗ Restituisci un oggetto JSON con:
- easy
- medium
- hard

❗ Ogni oggetto deve avere la stessa struttura (levelTitle, cards, ecc.)

### Bozza iniziale del modulo:
${JSON.stringify(fullDraft)}

❗ Rispondi SOLO con il JSON finale.
`

async function generateLearningModule({ topic, materia, lessonId }) {
  try {
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
      promptTemplate({ level: "easy", topic, materia, contextString }),
      8192,
      levelSchema
    )

    const medium = await gemini(
      contextString,
      promptTemplate({
        level: "medium",
        topic,
        materia,
        contextString,
        previousOutput: easy
      }),
      8192,
      levelSchema
    )

    const hard = await gemini(
      contextString,
      promptTemplate({
        level: "hard",
        topic,
        materia,
        contextString,
        previousOutput: medium
      }),
      8192,
      levelSchema
    )

    const fullDraft = { easy, medium, hard }

    const reviewed = await gemini(
      contextString,
      reviewPrompt({ topic, materia, fullDraft }),
      8192,
      reviewSchema
    )

    if (!reviewed) {
      console.error("❌ La revisione non ha restituito dati validi.")
      return null
    }

    const moduleDoc = {
      topic,
      materia,
      createdAt: new Date(),
      cover: imgLink,
      levels: reviewed
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
    console.log(`\n📘 Generando modulo: ${module.lessonId}`)
    const result = await generateLearningModule(module)
    if (result) {
      console.log(`✅ Modulo "${module.lessonId}" generato con successo!\n`)
      console.log("Titoli dei livelli:")
      console.log("- EASY:", result.easy.levelTitle)
      console.log("- MEDIUM:", result.medium.levelTitle)
      console.log("- HARD:", result.hard.levelTitle)
    } else {
      console.warn(
        `⚠️ Errore nella generazione del modulo \"${module.lessonId}\"`
      )
    }
  }
}

module.exports = { generateLearningModule, createDefaultModules }

// createDefaultModules()
