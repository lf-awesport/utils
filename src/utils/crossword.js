const { gemini } = require("../gemini")
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

/**
 * Funzione di validazione deterministica basata su vincoli programmatici.
 * @param {string} clue La definizione generata.
 * @param {string} normalizedAnswer La risposta normalizzata.
 * @returns {{isValid: boolean, errors: string[]}} Risultato della validazione.
 */
function validateClue(clue, normalizedAnswer) {
  const MAX_WORDS = 25
  const MAX_LEAKAGE_WORDS = 5
  const errors = []
  const clueWords = clue.trim().split(/\s+/)

  // 1. Controllo Limite di 15 Parole
  if (clueWords.length > MAX_WORDS) {
    errors.push(
      `Limite di ${MAX_WORDS} parole superato: ${clueWords.length} parole.`
    )
  }

  // 2. Controllo Anti-Leakage (Risposta nelle prime 5 parole)
  const firstFiveWords = clueWords
    .slice(0, MAX_LEAKAGE_WORDS)
    .join(" ")
    .toUpperCase()

  if (
    firstFiveWords.includes(normalizedAnswer) ||
    normalizedAnswer.includes(firstFiveWords)
  ) {
    // Controllo se l'answer è una singola parola nelle prime 5
    const normalizedAnswerClean = normalizedAnswer.replace(/[^A-Z]/g, "")

    const isLeaking = clueWords.slice(0, MAX_LEAKAGE_WORDS).some((word) => {
      const wordClean = word.replace(/[^A-Z]/gi, "").toUpperCase()
      return (
        wordClean.includes(normalizedAnswerClean) ||
        normalizedAnswerClean.includes(wordClean)
      )
    })

    if (isLeaking) {
      errors.push(
        `Violazione Anti-Leakage: la risposta o un suo derivato è presente nelle prime ${MAX_LEAKAGE_WORDS} parole.`
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  }
}

// Funzione completa e perfezionata per la generazione di cruciverba
async function generateCrosswordFromArticles({ articles, type }) {
  let allDefs = []
  const MAX_ANSWER_LENGTH = 15

  // --- FASE 1: Estrazione Grezza ---
  for (const article of articles) {
    // ... (omitted for brevity, assume FASE 1A/1B logic remains the same)
    // --- FASE 1A: Generazione Takeaways (5 frasi chiave per articolo) ---
    const takeawayPrompt = `🎯 Obiettivo: Analizza il seguente articolo di sport business e genera **5** frasi concise, chiare e fattuali che riassumano i punti chiave (takeaways). Ogni frase deve essere una sintesi di notizia completa e contenere una singola parola chiave (Nome di Persona, Città, Azienda, Organizzazione) che possa fungere da risposta.
    
    Requisiti:
    - La frase deve essere una sintesi di notizia completa (max 10 parole).
    - NON usare abbreviazioni, sigle poco note o slang.

    Formato: Rispondi solo con un array di stringhe in italiano, dove ogni stringa è un takeaway.

    Articolo:
    Titolo: ${article.title}
    Testo: ${article.body ? article.body.substring(0, 800) : ""}`

    let takeaways = []
    try {
      takeaways = await gemini(
        article.body || article.title,
        takeawayPrompt,
        2048,
        z.array(z.string())
      )
    } catch (e) {
      console.error(
        `Errore durante la generazione dei takeaways per l'articolo: ${article.title}`,
        e
      )
      continue
    }

    // --- FASE 1B: Single Clue & Answer Extraction (One definition per article) ---
    if (takeaways.length === 0) continue

    const allTakeawaysString = takeaways.join(". ") + "." // Combine all for context

    const singleClueExtractionPrompt = `🎯 Obiettivo: Trasforma TUTTE le seguenti frasi chiave (takeaways) tratte da un articolo di sport business in un **SINGOLO** oggetto per cruciverba [{clue, answer}].
    
    1.  **ANSWER SELECTION (PRIORITÀ):** Scegli la singola entità (Nome di Persona, Città, Azienda, Organizzazione) che è il SOGGETTO PRINCIPALE di TUTTE le frasi e usala come 'answer'. Preferisci risposte brevi (max ${MAX_ANSWER_LENGTH} caratteri) e che rappresentino una SINGOLA entità.
    2.  **CLUE CREATION (MASSIMA SINTESI):** Crea una 'clue' che sia la **MASSIMA SINTESI** di TUTTE le informazioni contenute nei takeaways. La clue deve essere molto descrittiva e includere solo i fatti essenziali di sport business.
    3.  **COMPLETEZZA CONTESTUALE:** La CLUE deve iniziare con la categoria del soggetto (es. "Club calcistico che", "Tennista che", "Corsa ciclistica che", "Organizzazione sportiva che") per fornire subito contesto.
    4.  L'answer deve essere pulita (parola singola o composta senza spazi, senza accenti o simboli).
    5.  Il focus della definizione DEVE essere *esclusivamente* sul contesto del business (finanza, marketing, gestione, infrastrutture, governance). Escludi categoricamente qualsiasi risultato sportivo o dettaglio tecnico non business-correlato.
    6. La definizione e scritta in maniera fluida e artistica, con precisione nell'assegnazione del contesto. Usa un punto, due periodi se troppo lunga.

    Takeaways (da unire e sintetizzare):
    ${allTakeawaysString}

    Esempio di output desiderato:
    [{ "clue": "Club calcistico che ha esonerato l'allenatore Hutter dopo la sconfitta in Champions League, con Pocognoli possibile successore. E' in una crisi societaria.", "answer": "MONACO" }]

    Formato: Rispondi solo con un array di UN SOLO oggetto in italiano: [{ clue, answer }]`

    try {
      const defs = await gemini(
        allTakeawaysString,
        singleClueExtractionPrompt,
        2048,
        z.array(z.object({ clue: z.string(), answer: z.string() })).length(1)
      )
      allDefs.push(defs[0])
    } catch (e) {
      console.error(
        `Errore durante la conversione in clue per l'articolo: ${article.title}`,
        e
      )
      continue
    }
  }

  // --- FASE 2A: Selezione Strategica e Pre-Filtro Rigido ---
  const selectionPrompt = `Sei un editor italiano. Hai a disposizione una lista di indizi, ora ciascuno rappresentante un intero articolo. Il tuo compito è selezionare i migliori 8-10 indizi rilevanti per lo
  sport business.

**Passaggi di Selezione (Nuove Priorità):**
1.  **Copertura Tematica (PRIORITÀ ASSOLUTA)**: Il set finale di 8-10 definizioni DEVE rappresentare il maggior numero possibile di TOPIC UNICI.
2.  **Accuratezza e Veridicità (PRIORITÀ MASSIMA):** La risposta deve essere inequivocabile.
3.  **RIGETTA* indizi il cui contenuto primario è dominato da risultati sportivi (gol, punteggi, tabellino) o focus tecnico.
4.  **VINCOLO DI LUNGHEZZA:** **RIGETTA** indizi con risposte (Answer) che superano i **${MAX_ANSWER_LENGTH} caratteri** o che sono combinazioni forzate di due entità.

Lista di indizi:
${JSON.stringify(allDefs.map((e) => ({ clue: e.clue, answer: normalizeAnswer(e.answer) })))}

Criteri tecnici:
- Risposta (Answer) deve avere almeno 4 lettere.

Restituisci solo un array di oggetti JSON pulito e finale nel formato: [{ clue, answer }]. Non includere commenti, spiegazioni o testo extra.`

  let selectedDefs = await gemini(
    JSON.stringify(allDefs),
    selectionPrompt,
    2048,
    z.array(z.object({ clue: z.string(), answer: z.string() }))
  )

  // --- FASE 2B: Rifinizione Stilistica e CICLO DI CORREZIONE FORZATA (NUOVO) ---
  const MAX_RETRIES = 3
  let attempts = 0
  let successfullyRefinedDefs = []
  let definitionsToRefine = selectedDefs.map((d) => ({
    clue: d.clue,
    answer: d.answer
  }))

  while (definitionsToRefine.length > 0 && attempts < MAX_RETRIES) {
    attempts++
    let correctionInstructions = []

    // Costruisci il prompt di rifinitura/correzione
    let refinementPrompt = `Sei un redattore sportivo e un esperto enigmista. Prendi i seguenti indizi e trasformali in definizioni che offrono il **MASSIMO CONTESTO INFORMATIVO** (sport, ruolo, evento, luogo) in modo sintetico. Mantieni la risposta (answer) ASSOLUTAMENTE INVARIATA.

**Obiettivo:** Massima informatività, completezza contestuale e stile enigmistico impeccabile.

2.  **Anti-Leakage (VINCOLANTE):** La parola chiave da indovinare (la 'answer') o una sua forma derivata/diretta **NON DEVE MAI APPARIRE NELLE PRIME CINQUE PAROLE DELLA CLUE**.
3.  **Contesto Giornalistico SPECIFICO (VINCOLANTE):** DEVE includere il riferimento al **TIPO DI SPORT/SETTORE** (es. club calcistico di [contesto] che, tennista [contesto] che, organizzazione sportiva [contesto] che), preferibilmente all'inizio.
3.  **COMPLETEZZA CONTESTUALE:** La CLUE deve iniziare con la categoria del soggetto (es. "Club calcistico [contesto] che", "Tennista [contesto] che", "Corsa ciclistica [contesto] che", "Organizzazione sportiva che") per fornire subito contesto.
    4.  L'answer deve essere pulita (parola singola o composta senza spazi, senza accenti o simboli).
    5.  Il focus della definizione DEVE essere *esclusivamente* sul contesto del business (finanza, marketing, gestione, infrastrutture, governance). Escludi categoricamente qualsiasi risultato sportivo o dettaglio tecnico non business-correlato.
    6. La definizione e scritta in maniera fluida e artistica, con precisione nell'assegnazione del contesto delle singole entita in modo che la definizione non sia generica e applicabile a tutti.

**ISTRUZIONI DI CORREZIONE SPECIFICHE (Tentativo ${attempts}/${MAX_RETRIES}):**
`
    if (attempts > 1) {
      refinementPrompt += `**ATTENZIONE:** Il codice ha riscontrato errori negli indizi precedenti. Devi correggere i seguenti problemi in modo programmatico e rigoroso. NON RIPETERE GLI ERRORI:
${correctionInstructions.join("\n")}
`
    } else {
      refinementPrompt += `Segui gli esempi di stile vincolante:`
    }

    refinementPrompt += `
**Esempi di Stile VINCOLANTE:**
* **JAVIERTEBAS:** "Presidente della Liga che elogia le iniziative a Miami, vedendo nel mercato USA una grande opportunità di crescita."
* **MIAMI:** "Città della Florida scelta per ospitare la prestigiosa amichevole calcistica tra Villarreal e Barcellona."
* **CHELSEA:** "Club inglese della Premier League interessato all'attaccante Dusan Vlahovic, un obiettivo della Juventus."

Indizi da rifinire/correggere:
${JSON.stringify(definitionsToRefine)}

Restituisci solo l'array di oggetti JSON finale nel formato: [{ clue, answer }].`

    let refinedDefs = []
    try {
      refinedDefs = await gemini(
        JSON.stringify(definitionsToRefine),
        refinementPrompt,
        2048,
        z.array(z.object({ clue: z.string(), answer: z.string() }))
      )
    } catch (e) {
      console.error("Errore nel ciclo di rifinitura:", e)
      break // Esci dal loop in caso di errore API
    }

    let nextBatchToRefine = []

    // --- Validazione Programmatica (Controllo Rigoroso) ---
    for (const def of refinedDefs) {
      const normalizedAnswer = normalizeAnswer(def.answer)
      const validationResult = validateClue(def.clue, normalizedAnswer)

      if (validationResult.isValid) {
        successfullyRefinedDefs.push({
          clue: def.clue,
          answer: normalizedAnswer
        })
      } else {
        // Se la validazione fallisce, prepara per un altro tentativo
        nextBatchToRefine.push({ clue: def.clue, answer: def.answer })
        correctionInstructions.push(
          `L'indizio per la risposta "${normalizedAnswer}" ("${def.clue}") ha fallito. Errori: ${validationResult.errors.join("; ")}`
        )
      }
    }

    // Aggiorna l'elenco degli indizi da inviare nel prossimo tentativo
    definitionsToRefine = nextBatchToRefine.map((item) => ({
      clue: item.clue,
      answer: item.answer
    }))

    if (definitionsToRefine.length > 0 && attempts < MAX_RETRIES) {
      console.log(
        `❌ Tentativo ${attempts} fallito. ${definitionsToRefine.length} indizi da correggere.`
      )
    }
  }

  // Utilizza solo le definizioni che hanno superato i vincoli programmatici
  const finalEntries = successfullyRefinedDefs.slice(0, 10)

  // --- FASE 3: Filtraggio Finale (deduplicazione) ---
  const seen = new Set()
  const MIN_ANSWER_LENGTH = 4

  const filteredEntries = finalEntries
    .filter((e) => {
      const key = e.answer.trim().toUpperCase()
      if (
        key.length < MIN_ANSWER_LENGTH ||
        key.length > MAX_ANSWER_LENGTH ||
        seen.has(key)
      )
        return false
      seen.add(key)
      return true
    })
    .slice(0, 10) // Manteniamo massimo 10 definizioni

  // --- FASE 4: Generazione Layout e Formattazione ---
  // Se meno di 4 indizi, prova a generare altri indizi con prompt più permissivo
  if (filteredEntries.length < 4) {
    console.log("Meno di 4 risposte valide, provo prompt alternativo.")
    // Prompt alternativo: meno vincoli, accetta anche risposte più corte e clue meno stringenti
    const fallbackPrompt = `Genera almeno 4 indizi [{clue, answer}] per cruciverba sport business, tutti strettamente inerenti all'articolo fornito. Usa solo informazioni presenti nell'articolo, accetta risposte di almeno 3 lettere. Restituisci solo array JSON: [{clue, answer}].`
    try {
      const fallbackDefs = await gemini(
        JSON.stringify(allDefs),
        fallbackPrompt,
        2048,
        z.array(z.object({ clue: z.string(), answer: z.string() })).min(4)
      )
      if (fallbackDefs.length >= 4) {
        // Normalizza e filtra
        const fallbackFiltered = fallbackDefs
          .map((e) => ({ clue: e.clue, answer: normalizeAnswer(e.answer) }))
          .filter((e) => e.answer.length >= 3)
          .slice(0, 10)
        if (fallbackFiltered.length >= 4) {
          filteredEntries.length = 0
          filteredEntries.push(...fallbackFiltered)
        }
      }
    } catch (err) {
      console.error("Fallback prompt fallito:", err)
    }
    // Se ancora meno di 4, ritorna errore
    if (filteredEntries.length < 4) {
      console.log(
        "Meno di 4 risposte valide per il cruciverba. Salto la generazione del layout."
      )
      return { across: {}, down: {} }
    }
  }

  try {
    const layout = clg.generateLayout(filteredEntries)
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
        crossword.across[acrossNum++] = entry
      } else {
        crossword.down[downNum++] = entry
      }
    })

    return crossword
  } catch (error) {
    console.error(
      "Errore nella generazione del layout del cruciverba (clg.generateLayout):",
      error
    )
    // Ritorna le definizioni grezze se il layout fallisce
    return { error: "Layout generation failed", definitions: filteredEntries }
  }
}

module.exports = {
  generateCrosswordFromArticles
}
