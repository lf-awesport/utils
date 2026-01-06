// src/utils/summarizeAndRerank.js
// Gestisce il batch processing per generare il campo 'rerank_summary'
// usando Gemini e aggiornando Firestore con paginazione basata sul cursore.

const { firestore } = require("../firebase")
const { gemini } = require("../gemini")
const { z } = require("zod")

// --- CONFIGURAZIONE E COSTANTI ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const GEMINI_DELAY_MS = 2000
const BATCH_READ_SIZE = 500 // Dimensione dei blocchi di lettura da Firestore
const BATCH_WRITE_SIZE = 100 // Dimensione del batch di scrittura Firestore (max 500)

// 💡 PROMPT AGGIORNATO: Forza un formato narrativo non strutturato (no JSON/liste) e richiede la data.
const PROMPT = `Riassumi il seguente articolo in una lunga e dettagliata narrazione coerente e fluida. Il contenuto deve includere: la data di pubblicazione, la tesi principale, i concetti chiave, e le implicazioni strategiche, nomi, cifre e riferimenti precisi nel modo piu completo e dettagliato possibile. Il suo unico scopo è essere utilizzato come input per un modello di reranking per la ricerca di pertinenza. Non usare citazioni dirette. RESTITUISCI SOLO E SOLTANTO il testo del riassunto, SENZA NESSUNA EVIDENZIAZIONE, etichetta o formattazione strutturata (es. JSON o liste puntate).`

// --- FUNZIONE DI SUPPORTO: SUMMARIZE ---

/**
 * Genera un riassunto mirato (max 800 token) per un singolo articolo utilizzando Gemini.
 * @param {Object} data - L'oggetto del documento Firestore (doc.data()).
 * @returns {Promise<string|null>} Il riassunto (stringa) o null in caso di errore/dati insufficienti.
 */
async function summarizeSingleArticle(data) {
  const articleBody = data.body || ""
  const analysis = data.analysis || {}

  // Costruzione della stringa di input arricchita (include DATA per il contesto)
  let articleForGemini = `
  DATA: ${data.date || "DATA SCONOSCIUTA"}
  TITOLO: ${data.title || "N/A"}
  TESI PRINCIPALE: ${analysis.tesi_principale || "N/A"}
  CONCETTI CHIAVE: ${Array.isArray(analysis.concetti_chiave) ? analysis.concetti_chiave.join(", ") : "N/A"}
  TAGS: ${Array.isArray(data.tags) ? data.tags.join(", ") : "N/A"}

  TESTO COMPLETO DA RIASSUMERE:
  ${articleBody}
  `
  // Controllo minimo sul testo
  if (
    !articleBody ||
    typeof articleBody !== "string" ||
    articleBody.length < 100
  )
    return null

  try {
    // Chiamata a Gemini per un output in plain text (z.string())
    const summary = await gemini(articleForGemini, PROMPT, 1024, z.string())
    return summary
  } catch (err) {
    return null
  }
}

/**
 * 💡 PROMPT GIORNALISTICO:
 * Trasforma una rassegna di articoli in un "Executive Daily Briefing"
 * scritto con stile editoriale di alto livello (es. Il Sole 24 Ore).
 */
const DAILY_REPORT_PROMPT = `
Sei il Caporedattore di una prestigiosa testata di Sport Business. 
Il tuo compito è scrivere il "Daily Executive Briefing": un articolo di analisi e cronaca che riassuma i fatti salienti della giornata in modo organico.

LINEE GUIDA EDITORIALI:
1. STILE: Scrittura fluida, autorevole e coinvolgente. Evita elenchi puntati; usa paragrafi narrativi.
2. CONNESSIONI: Non limitarti a riassumere i singoli pezzi, ma crea un filo logico tra i fatti (es. collegando trend economici, diritti TV e risultati sul campo).
3. VALORE MANAGERIARE: Sottolinea le implicazioni strategiche, nomi di protagonisti, cifre e riferimenti precisi.
4. APERTURA E CHIUSURA: Inizia con un'analisi del "mood" della giornata e chiudi con una riflessione sui trend emergenti.

FORMATO: Restituisci SOLO E SOLTANTO il testo dell'articolo narrativo.
ERRORE DA EVITARE: Nessun titolo, nessuna etichetta (es: "Riassunto:"), nessuna formattazione markdown come grassetti o liste. Solo testo piano (plain text) di eccellente qualità.`

/**
 * Genera un report narrativo unico basato su tutti gli articoli di una giornata.
 * @param {Array} articlesData - Array di oggetti documento (doc.data()) della giornata.
 * @returns {Promise<string|null>} L'articolo di sintesi giornaliera o null.
 */
async function generateDailyNarrativeReport(articlesData) {
  if (
    !articlesData ||
    !Array.isArray(articlesData) ||
    articlesData.length === 0
  ) {
    return null
  }

  // Costruiamo il contesto aggregato per Gemini
  const combinedContext = articlesData
    .map((data, index) => {
      const analysis = data.analysis || {}
      return `
    --- NOTIZIA ${index + 1} ---
    TITOLO: ${data.title || "N/A"}
    DATA ORIGINALE: ${data.date || "N/A"}
    FOCUS: ${analysis.tesi_principale || "N/A"}
    TAKEAWAYS: ${Array.isArray(analysis.takeaways) ? analysis.takeaways.join(" | ") : "N/A"}
    TESTO INTEGRALE: ${data.body ? data.body.substring(0, 1200) : "N/A"}
    `
    })
    .join("\n")

  const inputContext = `
  DATA DEL REPORT: ${articlesData[0].date || "Oggi"}
  ARTICOLI TOTALI ANALIZZATI: ${articlesData.length}

  DATASET GIORNALIERO:
  ${combinedContext}
  `

  try {
    // Chiamata a Gemini: aumentiamo il max_tokens per permettere un articolo completo
    const report = await gemini(
      inputContext,
      DAILY_REPORT_PROMPT,
      1500,
      z.string()
    )

    // Pulizia finale: rimuoviamo eventuali residui di formattazione markdown
    const cleanReport = report
      .replace(/[*#_]/g, "") // Rimuove grassetti e titoli markdown
      .trim()

    return cleanReport
  } catch (err) {
    console.error(
      "Errore durante la generazione del Daily Report:",
      err.message
    )
    return null
  }
}

module.exports = { summarizeSingleArticle, generateDailyNarrativeReport }
