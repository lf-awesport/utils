// utils/src/weeklySummary.js
const { firestore } = require("./firebase")
const { gemini } = require("./gemini")
const { z } = require("zod")
const clg = require("crossword-layout-generator")

// Schema Zod per insight giornalieri e settimanali
const insightSchema = z.object({
  trends: z.array(z.string()), // Trend principali per sport business
  insights: z.array(z.string()), // Insight pratici per social manager
  summary: z.string(), // Riassunto approfondito della settimana/giornata
  articleCount: z.number() // Conteggio articoli
})

const crosswordSchema = z.object({
  across: z.record(
    z.object({
      clue: z.string(),
      answer: z.string(),
      row: z.number(),
      col: z.number()
    })
  ),
  down: z.record(
    z.object({
      clue: z.string(),
      answer: z.string(),
      row: z.number(),
      col: z.number()
    })
  )
})

/**
 * Funzione di test: genera insight per le ultime 2 settimane consecutive
 */
async function testWeeklySummaryTwoWeeks() {
  const now = new Date()
  // Calcola il lunedì di 2 settimane fa
  const monday1 = new Date(now)
  monday1.setDate(now.getDate() - (((now.getDay() + 6) % 7) + 14))
  monday1.setHours(0, 0, 0, 0)
  // Calcola il lunedì della settimana scorsa
  const monday2 = new Date(now)
  monday2.setDate(now.getDate() - (((now.getDay() + 6) % 7) + 7))
  monday2.setHours(0, 0, 0, 0)

  // Genera insight per la settimana 1
  console.log("\n--- Insight settimana 1 ---")
  await generateWeeklySummaryForRange(monday1)
  // Genera insight per la settimana 2
  console.log("\n--- Insight settimana 2 ---")
  await generateWeeklySummaryForRange(monday2)
}

/**
 * Funzione per convertire una data in stringa 'YYYY-MM-DD'
 */
function toDateString(date) {
  return date.toISOString().slice(0, 10)
}

function buildInsightPrompt({ articles, contextString, type }) {
  const label = type === "daily" ? "giornata" : "settimana"
  const promptLabel = type === "daily" ? "oggi" : "nella settimana"

  return `Sei un social media manager esperto di sport business e formazione. Analizza gli articoli pubblicati ${promptLabel} e restituisci un oggetto JSON con il seguente formato:

{
  "trends": ["trend principale 1", "trend principale 2", ...],
  "insights": ["insight pratico 1", "insight pratico 2", ...],
  "summary": "Rassegna stampa completa e dettagliata della ${label}, focalizzata esclusivamente su notizie e contenuti rilevanti per il settore sport business. Riassumi in modo chiaro e ordinato i principali fatti, eventi, annunci, iniziative, accordi, investimenti, innovazioni e dichiarazioni emerse ${promptLabel}. Evita qualsiasi riferimento a risultati sportivi o contenuti non legati al business dello sport.",
  "articleCount": ${articles.length}
}

### Articoli della ${label}:
${contextString}

❗ Rispondi solo con l'oggetto JSON, senza saluti o testo extra.

Linee guida per "trends" e "insights":
- Inserici riferimenti precisi agli articoli, titoli, date, nomi, aziende, organizzazioni, eventi menzionati.
- Concentrati su contenuti utili per manager, studenti, operatori, stakeholder, aziende, investitori, professionisti del settore sport business.
- Approfondisci sempre l’impatto economico, gestionale, strategico, digitale, normativo, sociale, innovativo delle notizie.
`
}

// Generazione cruciverba con prompt separati per across/down
async function generateCrosswordFromArticles({ articles, type }) {
  // Funzione per normalizzare le risposte (rimuove accenti e caratteri non alfanumerici)
  function normalizeAnswer(str) {
    return str
      .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
  }
  // Prompt semplice: genera solo array [{clue, answer}] in italiano, precisi e formativi
  const prompt = `🎯 Obiettivo: Genera almeno 12 definizioni e risposte per un cruciverba dedicato alla formazione nel *sport business*.

📌 Formato: Rispondi solo con un array di oggetti in italiano, ciascuno nel formato: [{ clue, answer }]

✍️ Stile richiesto:

📚 Contenuto:
Le definizioni devono essere un mix bilanciato tra:

1. **Termini specifici**: nomi di manager, città, brand, eventi, tecnologie, regolamenti, ruoli, aziende, progetti, ecc.
   - Esempi:
     - “Dove il coccodrillo diventa GOAT per celebrare Djokovic” → *Lacoste*
     - “La banca che forma family banker con il programma Next” → *Mediolanum*
     - “Il gruppo acquisito da HEAD per espandere il respiro subacqueo” → *Aqualung*
   Gli esempi sono solo a scopo illustrativo: NON devono essere riutilizzati come risposta, né copiare le stesse definizioni o risposte.

2. **Concetti generali**: strategie, funzioni, impatti, pratiche, modelli di governance, sostenibilità, innovazione, ecc.
   - Esempi:
     - “Quando lo sport incontra il bilancio” → *Sponsorizzazione*
     - “La funzione che trasforma eventi in esperienze memorabili” → *Marketing*
     - “Governance sportiva con impatto ESG” → *Sostenibilità*
   Gli esempi sono solo a scopo illustrativo: NON devono essere riutilizzati come risposta, né copiare le stesse definizioni o risposte.

📎 Fonti:

🚫 Evita:

Fai brillare ogni definizione. Devono essere da manuale, da incorniciare.`

  const contextString = articles
    .map((a) => `Titolo: ${a.title}\n${a.body ? a.body.substring(0, 500) : ""}`)
    .join("\n---\n")
  const entries = await gemini(
    contextString,
    prompt,
    4096,
    z.array(z.object({ clue: z.string(), answer: z.string() }))
  )
  // Filtra risposte duplicate (case-insensitive)
  const seen = new Set()
  const filteredEntries = entries
    .map(e => ({
      clue: e.clue,
      answer: normalizeAnswer(e.answer)
    }))
    .filter((e) => {
      const key = e.answer.trim().toUpperCase()
      // Escludi risposte con spazi o punteggiatura
      if (/[^A-Z0-9]/i.test(key)) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
  // Genera il layout
  const layout = clg.generateLayout(filteredEntries)
  // layout.result è un array di oggetti: { clue, answer, startx, starty, position, orientation }

  // Adatta l'output per react-crossword: chiavi numeriche consecutive, row/col base 0
  const crossword = { across: {}, down: {} }
  let acrossNum = 1
  let downNum = 1
  layout.result.forEach((item) => {
    const entry = {
      clue: item.clue,
      answer: item.answer,
      row: item.starty - 1,
      col: item.startx - 1
    }
    if (item.orientation === "across") {
      crossword.across[acrossNum] = entry
      acrossNum++
    } else if (item.orientation === "down") {
      crossword.down[downNum] = entry
      downNum++
    }
  })
  return crossword
}

/**
 * Funzione generica per generare e salvare insight per un intervallo di date
 */
async function generateSummaryForRange({ startStr, endStr, type = "weekly" }) {
  const postsSnap = await firestore
    .collection("posts")
    .where("date", ">=", startStr)
    .where("date", "<=", endStr)
    .get()

  const articles = postsSnap.docs.map((doc) => doc.data())

  if (articles.length === 0) {
    console.log(
      `Nessun articolo trovato per il periodo: ${startStr} - ${endStr}`
    )
    return null
  }

  const contextString = articles
    .map((a) => `Titolo: ${a.title}\n${a.body ? a.body.substring(0, 500) : ""}`)
    .join("\n---\n")

  const insightPrompt = buildInsightPrompt({ articles, contextString, type })
  const insights = await gemini(
    contextString,
    insightPrompt,
    4096,
    insightSchema
  )
  const crossword = await generateCrosswordFromArticles({ articles, type })
  console.log("Cruciverba generato:", JSON.stringify(crossword, null, 2))

  const docData = {
    createdAt: new Date(),
    ...insights,
    crossword
  }
  if (type === "weekly") {
    docData.weekStart = startStr
    docData.weekEnd = endStr
    await firestore.collection("weeklySummaries").doc(startStr).set(docData)
    console.log("✅ Insight e cruciverba generati per settimana:", startStr)
  } else {
    docData.day = startStr
    await firestore.collection("dailySummaries").doc(startStr).set(docData)
    console.log("✅ Insight e cruciverba generati per il giorno:", startStr)
  }
  return docData
}

async function generateWeeklySummaryForRange(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  const startStr = toDateString(weekStart)
  const endStr = toDateString(weekEnd)
  return await generateSummaryForRange({ startStr, endStr, type: "weekly" })
}

async function generateDailySummaryForDate(dateStr) {
  return await generateSummaryForRange({
    startStr: dateStr,
    endStr: dateStr,
    type: "daily"
  })
}

/**
 * Funzione di test: genera report giornaliero per oggi e ieri
 */
async function testDailySummary() {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const yesterday2 = new Date(today)
  yesterday2.setDate(today.getDate() - 2)
  const yesterdayStr2 = yesterday2.toISOString().slice(0, 10)

  console.log("\n--- Report giornaliero di oggi ---")
  await generateDailySummaryForDate(yesterdayStr2)
  console.log("\n--- Report giornaliero di ieri ---")
  await generateDailySummaryForDate(yesterdayStr)
}

module.exports = {
  testWeeklySummaryTwoWeeks,
  generateDailySummaryForDate,
  testDailySummary
}

// testWeeklySummaryTwoWeeks() // Esegui il test per 2 settimane consecutive
testDailySummary()
