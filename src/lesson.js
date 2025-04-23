const { firestore } = require("./firebase")
const { z } = require("zod")
const { gemini } = require("./gemini")
const { searchSimilarDocuments } = require("./queryRAG")

const levelZod = z.object({
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
  essay: z.object({
    title: z.string(),
    essay: z.string()
  }),
  easy: levelZod,
  medium: levelZod,
  hard: levelZod
})
const essayZod = z.object({
  title: z.string(),
  essay: z.string()
})

const levelInstructions = {
  easy: `\nIntroduzione ai concetti base del diritto sportivo.\n- Definisci termini fondamentali (es. ordinamento sportivo, CONI, giurisdizione sportiva).\n- Spiega in modo semplice, con esempi concreti ma basilari.\n- NON introdurre norme specifiche o casi complessi.`,
  medium: `\nApplicazioni pratiche e riferimenti normativi.\n- Focalizzati su regolamenti (es. WADA, Codice di Giustizia Sportiva), ruoli di organi e sanzioni.\n- Fai riferimento a casi reali, ma spiegandoli in modo chiaro.\n- NON ripetere concetti introdotti nell’EASY.`,
  hard: `\n🧠Approccio critico e avanzato.\n- Analizza dilemmi interpretativi, contraddizioni normative, giurisprudenza e principi UE.\n- Stimola la riflessione giuridica con domande aperte.\n- NON ripetere quanto già spiegato nei livelli precedenti.`
}

const essayPrompt = ({ topic, materia, contextString }) => `
Sei un esperto di diritto sportivo. Scrivi un breve saggio (max 400 parole) per aiutare uno studente universitario a comprendere il tema: **\"${topic}\"**, all'interno del corso di \"${materia}\".

Utilizza un linguaggio accessibile, ma rigoroso e ben strutturato. Lo scopo è preparare lo studente ad affrontare il modulo didattico. Fai riferimento a fatti reali, norme o principi fondamentali rilevanti, ma senza andare troppo nel dettaglio normativo.

### Contesto disponibile:
${contextString}...

FORMATTA TUTTO IN MARKDOWN SEMANTICO EVIDENZIANDO IN GRASSETTO o IN CORSIVO LE PAROLE CHIAVE.

❗ Rispondi con un oggetto JSON:
{
  "title": "Titolo del saggio",
  "essay": "Testo del saggio"
}
`

const promptTemplate = ({
  level,
  topic,
  materia,
  contextString,
  essay,
  previousOutput = null
}) => {
  const additionalContext = previousOutput
    ? `
### Output del livello precedente:
${JSON.stringify(previousOutput)}
`
    : ""

  const introEssay = essay
    ? `
### Saggio introduttivo:
Titolo: ${essay.title}
${essay.essay}
`
    : ""

  return `
Sei un esperto di Diritto Sportivo e docente universitario. Devi progettare un modulo didattico sul tema **\"${topic}\"**, per il corso di \"${materia}\".

### Livello: ${level.toUpperCase()}
${levelInstructions[level]}

${additionalContext}

### Contesto (articoli e fonti reali):
${contextString}...

### Obiettivo:
Aiuta gli studenti a comprendere concetti chiave del diritto sportivo, in modo coerente con il livello di difficoltà.

### Requisiti output:
Restituisci un **oggetto JSON**:
- levelTitle: titolo del livello
- cards: 5 schede, ognuna con:
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

Hai ricevuto una bozza completa di un modulo didattico sul tema: **\"${topic}\"**, per il corso di \"${materia}\". La bozza è divisa in 3 livelli: EASY, MEDIUM, HARD e contiene un saggio introduttivo.

### Il tuo compito:
- Rivedi **interamente** il modulo.
- Per ogni livello:
  - Riformula il **levelTitle** per renderlo più **specifico e coerente** con i contenuti delle carte.
  - Mescola **l’ordine delle opzioni del quiz**, mantenendo invariata la risposta corretta.
  - Mantieni solo 3 cards per livello, evitando ripetizioni di contenuti.
  - Migliora lo stile e la chiarezza se necessario.
- Rivedi anche il **saggio introduttivo**, assicurandoti che sia coerente, ben scritto e utile a comprendere il tema.
- NON aggiungere nuovi contenuti, ma migliora la coerenza e varietà.
- NON ripetere concetti già trattati in altri livelli.

❗ Restituisci un oggetto JSON con:
- essay
- easy
- medium
- hard

❗ Ogni oggetto deve avere la struttura prevista.

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

    const essay = await gemini(
      contextString,
      essayPrompt({ topic, materia, contextString }),
      4096,
      essayZod
    )

    const easy = await gemini(
      contextString,
      promptTemplate({ level: "easy", topic, materia, contextString, essay }),
      8192,
      levelZod
    )

    const medium = await gemini(
      contextString,
      promptTemplate({
        level: "medium",
        topic,
        materia,
        contextString,
        essay,
        previousOutput: easy
      }),
      8192,
      levelZod
    )

    const hard = await gemini(
      contextString,
      promptTemplate({
        level: "hard",
        topic,
        materia,
        contextString,
        essay,
        previousOutput: medium
      }),
      8192,
      levelZod
    )

    const fullDraft = { easy, medium, hard, essay }

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
      essay,
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
      materia: "Sport Law",
      lessonId: "sinner-wada-quiz-module"
    },
    {
      topic:
        "Nicolò Fagioli e le scommesse sportive: disciplina, sanzioni e giurisdizione",
      materia: "Sport Law",
      lessonId: "fagioli-scommesse-quiz-module"
    },
    {
      topic:
        "Ultras, mafia e responsabilità nel calcio italiano: tra ordine pubblico e autonomia sportiva",
      materia: "Sport Law",
      lessonId: "ultras-mafia-quiz-module"
    },
    {
      topic:
        "La Superlega e il Monopolio Federale: concorrenza tra circuiti e sentenza UE",
      materia: "Sport Law",
      lessonId: "superlega-monopolio-ue"
    },
    {
      topic:
        "Il lavoro sportivo dilettantistico: riforma normativa, sentenze e impatto sulle ASD",
      materia: "Sport Law",
      lessonId: "lavoro-sportivo-dilettanti"
    },
    {
      topic:
        "Tutela dei minori nello sport: safeguarding, procedimenti speciali e confronto con l’ordinamento penale",
      materia: "Sport Law",
      lessonId: "tutela-minori-sport"
    },
    {
      topic:
        "Illecito sportivo vs. civile: analisi giurisprudenziale e criteri distintivi",
      materia: "Sport Law",
      lessonId: "illecito-sportivo-civile"
    },
    {
      topic:
        "Spionaggio sportivo e fair play: droni, etica e sanzioni nelle competizioni internazionali",
      materia: "Sport Law",
      lessonId: "spionaggio-fairplay-sportivo"
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
