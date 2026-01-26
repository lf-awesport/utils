const { gemini } = require("../services/gemini")
const { z } = require("zod")
const clg = require("crossword-layout-generator")

/**
 * Normalizza una stringa di risposta: rimuove accenti, converte in maiuscolo
 * ed elimina tutti i caratteri non alfanumerici eccetto gli spazi, che vengono rimossi.
 * @param {string} str La stringa da normalizzare.
 * @returns {string} La stringa normalizzata (senza spazi).
 */
function normalizeAnswer(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Rimuove gli accenti
    .replace(/ /g, "") // Rimuove gli spazi (cruciale per clg)
    .replace(/[^A-Z0-9]/gi, "") // Mantiene solo lettere e numeri
    .toUpperCase()
}

// Funzione completa e perfezionata per la generazione di cruciverba
async function generateCrosswordFromArticles({ articles }) {
  let allDefs = []
  const MAX_ANSWER_LENGTH = 15
  const MIN_ANSWER_LENGTH = 3
  const MIN_REQUIRED_DEFINITIONS = 2

  // --- FASE 1: Estrazione Diretta delle Clue e Answer ---
  for (const article of articles) {
    // Aggreghiamo i campi più rilevanti per un prompting mirato e business-focalizzato
    const aggregatedContent = `
      Titolo: ${article.title || "N/A"}
      Sintesi (rerank_summary): ${article.rerank_summary || article.excerpt || "N/A"}
      Takeaways (PUNTI CHIAVE BUSINESS): ${article.takeaways ? article.takeaways.join(". ") : "N/A"}
      Entità Rilevanti: ${article.entita_rilevanti ? article.entita_rilevanti.join(", ") : "N/A"}
    `
    // Usiamo il contenuto aggregato per il contesto, limitato a 1000 caratteri
    const contextForModel = aggregatedContent.substring(0, 1000)

    const directClueExtractionPrompt = `🎯 Obiettivo: Analizza il seguente contenuto di sport business e genera **4** coppie di definizioni (clue) e risposte (answer) per un cruciverba.
    
    Requisiti Ferrei per ogni coppia {clue, answer} - PRIORITÀ AL BUSINESS E ALLA FORMALIZZAZIONE:
    
    1.  **CLUE FOCUS & PRIORITÀ BUSINESS:** La definizione (CLUE) DEVE basarsi **principalmente** sulle informazioni relative a finanza, media, governance, marketing, o sponsorizzazioni (ignorare i risultati sportivi).
    2.  **CLUE CONTEXT:** La CLUE DEVE iniziare con la categoria del soggetto (es. "Club calcistico che", "Organizzazione sportiva che") per dare immediato contesto.
    3.  **ANSWER FORMALIZZAZIONE:** La 'answer' DEVE essere una singola entità (Nome di Persona, Azienda, Organizzazione), scritta **SENZA ALCUNO SPAZIO**, senza accenti, trattini o simboli.
    4.  **LENGTH:** L'answer (risposta pulita, senza spazi) deve avere una lunghezza compresa tra ${MIN_ANSWER_LENGTH} e ${MAX_ANSWER_LENGTH} caratteri.
    5.  **QUALITY:** La definizione deve essere concisa, descrittiva e fluida.

    Contenuto Analizzato (Focalizzati sui Punti Chiave BUSINESS):
    ${contextForModel}

    Formato: Rispondi SOLO con un array JSON di oggetti in italiano: [{ "clue": "...", "answer": "..." }, ...].`

    let defs = []

    if (contextForModel.length < 50) {
      console.warn(
        `Articolo ignorato per contenuto insufficiente: ${article.title}`
      )
      continue
    }

    try {
      defs = await gemini(
        contextForModel,
        directClueExtractionPrompt,
        2048,
        z
          .array(z.object({ clue: z.string(), answer: z.string() }))
          .min(1)
          .max(4)
      )
    } catch (e) {
      console.error(
        `[FALLIMENTO GEMINI] Errore durante la generazione di clue/answer per l'articolo: ${article.title}`,
        e
      )
      continue
    }

    allDefs.push(...defs)
  }

  // --- FASE 2: Normalizzazione, Filtraggio e Unicità ---
  const normalizedMap = new Map()
  const filteredEntries = []
  let validDefinitionCount = 0

  for (const entry of allDefs) {
    const normalizedAnswer = normalizeAnswer(entry.answer)

    // Filtro finale per lunghezza e unicità
    if (
      normalizedAnswer.length >= MIN_ANSWER_LENGTH &&
      normalizedAnswer.length <= MAX_ANSWER_LENGTH &&
      !normalizedMap.has(normalizedAnswer)
    ) {
      filteredEntries.push({
        clue: entry.clue,
        answer: normalizedAnswer
      })
      normalizedMap.set(normalizedAnswer, true)
      validDefinitionCount++
    }
  }

  // Controllo di validità per la generazione del layout (minimo 2)
  if (validDefinitionCount < MIN_REQUIRED_DEFINITIONS) {
    return {
      error: `Layout generation failed: solo ${validDefinitionCount} definizioni valide generate. Ne servono almeno ${MIN_REQUIRED_DEFINITIONS}.`,
      definitions: filteredEntries
    }
  }

  // --- FASE 3: Generazione del Layout del Cruciverba ---
  try {
    const layout = clg.generateLayout(filteredEntries)
    const crossword = { across: {}, down: {} }
    let clueNumber = 1

    layout.result.forEach((item) => {
      // Determina il numero della clue
      const number = clueNumber++

      const entry = {
        clue: item.clue,
        answer: item.answer,
        row: item.starty - 1,
        col: item.startx - 1
      }

      // Assegna la clue al blocco 'across' o 'down'
      if (item.orientation === "across") {
        crossword.across[number] = entry
      } else {
        crossword.down[number] = entry
      }
    })

    return crossword
  } catch (error) {
    console.error(
      "[FALLIMENTO CLG] Errore nella generazione del layout del cruciverba (clg.generateLayout):",
      error
    )
    return {
      error: "Layout generation failed (clg error)",
      definitions: filteredEntries
    }
  }
}

module.exports = {
  generateCrosswordFromArticles
}
