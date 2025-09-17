// utils/src/weeklySummary.js
const { firestore } = require("./firebase")
const { gemini } = require("./gemini")
const { z } = require("zod")

// Schema Zod per insight settimanali
const insightWeeklySchema = z.object({
  weekTrends: z.array(z.string()), // Trend principali
  insights: z.array(z.string()), // Insight pratici per social manager
  recommendPosts: z.array(z.string()), // Idee post social media per formazione sport business
  summary: z.string(), // Riassunto esteso della settimana
  articleCount: z.number() // Conteggio articoli
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

/**
 * Genera insight per una settimana specifica (lunedì-domenica)
 */
async function generateWeeklySummaryForRange(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const startStr = toDateString(weekStart)
  const endStr = toDateString(weekEnd)

  const postsSnap = await firestore
    .collection("posts")
    .where("date", ">=", startStr)
    .where("date", "<=", endStr)
    .get()

  const articles = postsSnap.docs.map((doc) => doc.data())

  if (articles.length === 0) {
    console.log("Nessun articolo trovato per la settimana:", startStr)
    return null
  }

  const contextString = articles
    .map((a) => `Titolo: ${a.title}\n${a.body ? a.body.substring(0, 500) : ""}`)
    .join("\n---\n")

  const insightPrompt = `
Sei un social media manager esperto di sport business e formazione. Analizza gli articoli pubblicati nella settimana e restituisci un oggetto JSON con:
{
  "weekTrends": ["trend principale 1", ...], // Solo trend rilevanti per il business dello sport (es. innovazione, marketing, governance, digital, sostenibilità, eventi, sponsorship, fan engagement, ecc.)
  "insights": ["insight pratico 1", ...], // Solo insight utili per chi lavora o studia nel settore sport business (strategie, opportunità, rischi, best practice, casi studio, ecc.)
  "recommendPosts": ["idea post social 1", ...], // Idee di post social media da proporre su una pagina dedicata alla formazione e informazione sullo sport business (es. approfondimenti su modelli di business, analisi di mercato, interviste a manager, trend digital, ecc.)
  "summary": "Riassunto esteso e dettagliato della settimana, focalizzato su temi, notizie e discussioni rilevanti per il settore sport business. Evita contenuti generici sullo sport giocato.",
  "articleCount": ${articles.length}
}

### Articoli della settimana:
${contextString}

❗ Rispondi solo con l'oggetto JSON, senza saluti o testo extra. Tutto deve essere rilevante per il business dello sport, la formazione manageriale e le professioni del settore.

Linee guida:
- Ignora notizie e trend che riguardano solo risultati sportivi, cronaca, gossip o curiosità non legate al business.
- Concentrati su contenuti utili per manager, studenti, operatori, stakeholder, aziende, investitori, professionisti del settore sport business.
- Approfondisci sempre l’impatto economico, gestionale, strategico, digitale, normativo, sociale, innovativo delle notizie.
- Le idee post devono essere utili per una pagina che fa formazione, divulgazione e networking nel mondo sport business.
`

  const insights = await gemini(
    contextString,
    insightPrompt,
    4096,
    insightWeeklySchema
  )

  const insightsDoc = {
    weekStart: startStr,
    weekEnd: endStr,
    createdAt: new Date(),
    ...insights
  }

  await firestore.collection("weeklySummaries").doc(startStr).set(insightsDoc)

  console.log("✅ Insight generati per settimana:", startStr)
  return insightsDoc
}

module.exports = { testWeeklySummaryTwoWeeks }

// testWeeklySummaryTwoWeeks() // Esegui il test per 2 settimane consecutive
