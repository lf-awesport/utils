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

// --- FUNZIONE PRINCIPALE: BATCH PROCESSING CON PAGINAZIONE ---

/**
 * Scansiona la collezione 'sentiment' in blocchi paginati, riassume i documenti mancanti
 * del campo 'rerank_summary' e aggiorna Firestore in batch, rispettando i limiti QPM.
 */
async function summarizeAndRerankAll() {
  console.log("--- INIZIO summarizeAndRerankAll con Paginazione ---")

  let lastDoc = null // Cursore per la paginazione
  let hasMore = true
  let totalProcessed = 0
  let totalSkipped = 0
  let totalDocumentsRead = 0

  while (hasMore) {
    let query = firestore
      .collection("sentiment")
      // '__name__' è l'alias per l'ID del documento, necessario per la paginazione
      .orderBy("__name__")
      .limit(BATCH_READ_SIZE)

    if (lastDoc) {
      // Continua la lettura dal documento successivo all'ultimo letto
      query = query.startAfter(lastDoc)
    }

    // Lettura del blocco da Firestore
    const snapshot = await query.get()

    if (snapshot.empty) {
      hasMore = false
      break
    }

    let dbBatch = firestore.batch()
    let dbBatchCount = 0

    console.log(
      `\n--- BLOCCO INIZIATO: Letti ${snapshot.docs.length} documenti ---`
    )

    for (const doc of snapshot.docs) {
      totalDocumentsRead++
      lastDoc = doc // Aggiorna il cursore per il prossimo blocco

      const data = doc.data()

      // FILTRO ROBUSTO IN MEMORIA: skippa se il campo esiste ED ha contenuto valido.
      if (
        data.rerank_summary &&
        typeof data.rerank_summary === "string" &&
        data.rerank_summary.length > 10
      ) {
        totalSkipped++
        continue
      }

      // RATE LIMIT: Aspetta prima di chiamare Gemini
      if (totalProcessed > 0) {
        await sleep(GEMINI_DELAY_MS)
      }

      console.log(
        `[${totalDocumentsRead}] PROCESS: ${doc.id} - Invio a Gemini...`
      )
      try {
        const summary = await summarizeSingleArticle(data)
        if (summary) {
          dbBatch.update(doc.ref, { rerank_summary: summary })
          dbBatchCount++
          totalProcessed++

          if (dbBatchCount === BATCH_WRITE_SIZE) {
            await dbBatch.commit()
            console.log(
              `BATCH COMMIT: ${BATCH_WRITE_SIZE} aggiornamenti eseguiti.`
            )
            dbBatch = firestore.batch()
            dbBatchCount = 0
          }
        }
      } catch (err) {
        console.error(
          `[${totalDocumentsRead}] ERROR: ${doc.id} - ${err.message}`
        )
      }
    }

    // Commit degli aggiornamenti rimanenti nel blocco corrente
    if (dbBatchCount > 0) {
      await dbBatch.commit()
      console.log(`BLOCCO COMMIT: ${dbBatchCount} aggiornamenti eseguiti.`)
    }

    // Se il blocco letto è inferiore alla dimensione massima, abbiamo raggiunto la fine della collezione
    if (snapshot.docs.length < BATCH_READ_SIZE) {
      hasMore = false
    }
  }

  console.log(`--- FINE summarizeAndRerankAll ---`)
  console.log(`Totale documenti letti: ${totalDocumentsRead}`)
  console.log(`Totale riassunti e aggiornati: ${totalProcessed}`)
  console.log(`Totale saltati (già riassunti): ${totalSkipped}`)
}

module.exports = { summarizeSingleArticle }
