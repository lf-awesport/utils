/**
 * @fileoverview Lesson Generation Tools
 * Contains AI instructions orchestrating a single daily micro-learning press review module.
 * @module lessonGen
 */
const { firestore } = require("../services/firebase")
const { z } = require("zod")
const { gemini } = require("../services/gemini")

const clusterZod = z.object({
  topics: z.array(
    z.object({
      topicTitle: z.string().describe("Il titolo del macro-argomento di Sport Business"),
      articleIndices: z.array(z.number()).describe("Gli indici degli articoli pertinenti a questo argomento")
    })
  )
})

const cardZod = z.object({
  title: z.string(),
  content: z.string(),
  quiz: z.object({
    question: z.string(),
    options: z.array(z.string()).min(3).max(3),
    correctAnswer: z.string()
  })
})

const clusterPrompt = (dateString, articlesSummary) => `
Sei un caporedattore specializzato in SPORT BUSINESS. Analizzi le notizie della giornata.
Oggi è il ${dateString}.

### Il tuo compito:
Raggruppa le notizie ricevute in macro-argomenti rilevanti per l'economia, finanza, diritti TV, marketing e infrastrutture dello sport.
Se più articoli parlano dello stesso avvenimento o tema, raggruppali in un unico topic.
❗ **IGNORA ASSOLUTAMENTE** le notizie di solo "sport giocato" (risultati, infortuni, pagelle, commenti tecnici puramente sportivi senza implicazioni economiche).

### Notizie di oggi:
${articlesSummary}

### Requisiti output:
Restituisci un oggetto JSON con un array 'topics'. Per ogni topic indica un 'topicTitle' chiaro e la lista 'articleIndices' con gli indici numerici esatti estratti dalle notizie fornite.
`

const cardPrompt = (topicTitle, contextString) => `
Sei un esperto giornalista e analista, specializzato in SPORT BUSINESS e management sportivo.
Devi scrivere una singola "Card" di micro-learning estremamente densa e verticale sul topic: **"${topicTitle}"**.

### Contesto specifico:
${contextString}

### Obiettivo:
Scrivi una sintesi profonda (min 150, max 250 parole) che spieghi l'avvenimento, focalizzandosi in modo analitico su strategie, implicazioni di business, finanza o impatto sulle industry dello sport.

### Requisiti output:
Restituisci un **oggetto JSON**:
- title: Titolo chiaro per focalizzare l'argomento.
- content: L'analisi scritta in paragrafi ben divisi.
- quiz: 1 domanda a risposta multipla per verificare la comprensione dei punti chiave.
  - question: Domanda focalizzata sul business del testo appena scritto.
  - options: Array essatto di 3 opzioni plausibili.
  - correctAnswer: L'opzione esatta (deve essere identica a una delle options).
`

/**
 * Generates a single Daily Press Review lesson from the day's articles.
 * Multi-step RAG: Groups articles into topics, then generates one card per topic.
 * 
 * @async
 * @param {string} dateString - Date to scan for raw imported articles format YYYY-MM-DD.
 * @returns {Promise<Array>} List containing the single generated module description (or empty array).
 */
async function generateLessonsFromDailyTopics(dateString) {
  try {
    const materia = "Sport Management"
    console.log("🔍 Ricerca articoli per la Daily Press Review del " + dateString + "...")
    const postsSnap = await firestore
      .collection("sentiment")
      .where("date", "==", dateString)
      .get()

    if (postsSnap.empty) {
      console.log("Nessun post trovato per la data " + dateString)
      return []
    }

    const articles = []
    let imgLink = null
    postsSnap.forEach(doc => {
      const data = doc.data()
      articles.push(data)
      if (!imgLink && data.imgLink) imgLink = data.imgLink
    })

    // 1. Costruiamo il riassunto breve delle notizie per il clustering
    let summaryText = ""
    articles.forEach((art, index) => {
      // Usiamo una slice ancora più corta per limitare i token (evita "Failed to generate response")
      const snippet = art.excerpt || (art.analysis?.cleanText ? art.analysis.cleanText.slice(0, 100) : "")
      summaryText += "\n[" + index + "] Titolo: " + art.title + "\nEstratto: " + snippet + "...\n"
    })

    console.log("📘 Estraggo i topic da " + articles.length + " articoli...")
    
    const clusteringResult = await gemini(
      "Raggruppa le notizie pertinenti in base al testo fornito nel prompt",
      clusterPrompt(dateString, summaryText),
      4096,
      clusterZod
    )

    if (!clusteringResult || !clusteringResult.topics || clusteringResult.topics.length === 0) {
      console.warn("❌ Nessun topic valido di business trovato nel clustering.")
      return []
    }

    const validCards = []

    // 2. Generazioni Card Independenti per ogni Topic (Chiamate più piccole ma iper precise)
    for (const topic of clusteringResult.topics) {
      if (!topic.articleIndices || topic.articleIndices.length === 0) continue

      // Estrai il contesto lungo degli articoli pertinenti a QUESTO topic
      let specificContext = ""
      for (const idx of topic.articleIndices) {
        if (articles[idx]) {
          const contentText = articles[idx].analysis?.cleanText || articles[idx].excerpt
          specificContext += "\n--- ARTICOLO FONTE ---\nTitolo: " + articles[idx].title + "\nTesto: " + contentText + "\n"
        }
      }

      console.log("📝 Genero card per topic: '" + topic.topicTitle + "' (" + topic.articleIndices.length + " articoli fonte)...")
      
      try {
        const cardResult = await gemini(
          "Genera la card di approfondimento",
          cardPrompt(topic.topicTitle, specificContext),
          4096,
          cardZod
        )
        if (cardResult && cardResult.title && cardResult.content) {
          validCards.push(cardResult)
        }
      } catch (errCard) {
        console.error("Errore generazione card per topic '" + topic.topicTitle + "':", errCard.message)
      }
    }

    if (validCards.length === 0) {
      console.error("❌ Nessuna card generata dai topic individuati.")
      return []
    }
    
    // Mescola le opzioni dei quiz per sicurezza
    for (const c of validCards) {
      if (c.quiz && c.quiz.options) {
        c.quiz.options = c.quiz.options.sort(() => Math.random() - 0.5)
      }
    }

    const lessonId = "daily-" + dateString
    const lessonTitle = "Daily Press Review: " + dateString

    const moduleDoc = {
      topic: lessonTitle,
      materia,
      createdAt: new Date(),
      cover: imgLink,
      levels: {
        easy: {
          levelTitle: lessonTitle,
          cards: validCards
        }
      }
    }

    await firestore
      .collection("learningModules")
      .doc(materia)
      .collection("lessons")
      .doc(lessonId)
      .set(moduleDoc)

    console.log("✅ Salvata lezione " + lessonId + " con " + validCards.length + " cards.")
    
    return [{ topic: lessonTitle, lessonId, success: true }]
  } catch (err) {
    console.error("Errore in generateLessonsFromDailyTopics per " + dateString + ":", err.message)
    return []
  }
}



/**
 * Loops backwards up to 30 days checking and generating missing daily lessons.
 */
async function backfillDailyLessons() {
  const today = new Date();
  const results = [];

  // Loop backwards 30 days until yesterday
  for (let i = 30; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateString = d.toISOString().split("T")[0];

    // Check directly in the learningModules collection to see if lesson (report) exists
    const lessonDoc = await firestore
      .collection("learningModules")
      .doc("Sport Management")
      .collection("lessons")
      .doc(`daily-${dateString}`)
      .get();

    if (lessonDoc.exists) {
      console.log(`${dateString}: SKIPPED (lesson already generated)`);
      results.push(`${dateString}: SKIPPED`);
      continue;
    }

    try {
      await generateLessonsFromDailyTopics(dateString);
      results.push(`${dateString}: OK`);
    } catch (err) {
      results.push(`${dateString}: ERROR - ${err.message}`);
    }
  }

  return results;
}

module.exports = { generateLessonsFromDailyTopics, backfillDailyLessons };

if (require.main === module) {
  backfillDailyLessons().then(() => {
    console.log("Daily lessons process completed.");
    process.exit(0);
  });
}
