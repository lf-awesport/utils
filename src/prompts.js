const sentimentAnalysisPrompt = `
Please analyze the following text and provide a detailed JSON response that includes the following aspects.
Write all the final content in Italian. Ensure the text is grammatically correct, clearly structured, and impactful. Escape quotes and special characters. The output must be a valid JSON object with the following fields:

---

🔎 **analisi_leggibilita**
Determine the readability level of the text using metrics such as the Flesch-Kincaid score (range 0–100, where higher means easier) and estimate the average reading time in minutes.
Provide a short explanation that justifies the score by referring to sentence length, vocabulary complexity, and overall text structure.

---

⚖️ **rilevazione_di_pregiudizio**
Identify any potential bias present in the article.
Indicate:
- tipo_di_pregiudizio:  
  1 = Politico  
  2 = Culturale  
  3 = Economico  
  4 = Sociale  
  5 = Altro  
- grado_di_pregiudizio: from 0 (neutral) to 100 (strong bias)
Explain the nature and reasoning behind the detected bias, or explain why the text is considered neutral.

---

🎭 **rilevazione_emozioni**
Identify the primary emotions conveyed by the article. Assign a percentage (0–100) for each of the following:
- gioia, tristezza, rabbia, paura, sorpresa  
Provide a short summary that explains the emotional tone of the article and how the emotions are expressed in the text.

---

🏷️ **tags**
Assign one or more tags strictly from the following sports-related categories. Only use relevant tags based on the main content of the article.

Valid categories:
[Sports Law, Finance, Esport, Event Management, Marketing, Sponsorship, Sport for Good, Sport Equipment, Sport Tourism, Media, Fan Experience]

---

🧠 **takeaways**
Read the article and extract exactly 5 impactful, concise insights.  
Each takeaway must:
- Be a complete sentence in Italian.
- Capture a key point, observation, or strategic implication.
- Be useful and relevant to professionals in the sport business sector.

---

🧹 **cleanText**
Generate a cleaned version of the article, suitable for building a word cloud:
- Remove all articles, prepositions, quotes, special characters, conjunctions, pronouns, and common stop words.
- Remove all words that occur only once.
- Normalize words (e.g., lowercase, singular).
- Return a single string containing only the most meaningful and relevant words separated by spaces.

---

📈 **Metadati per RAG avanzato**
Please extract the following fields to improve search, filtering, and generation quality in AI-based systems:

- scopo: communicative intent of the article (es: "informare", "educare", "analizzare", "promuovere")
- tesi_principale: the main thesis or key message of the article, in one full sentence
- concetti_chiave: array of 3–5 recurring or significant concepts from the article
- orizzonte_temporale: either "passato", "attualità", or "futuro"
- dominio: the main domain covered (e.g., "Sport Business", "Marketing", "Tecnologia", "Legge")

- tipo_contenuto: the rhetorical or editorial format (e.g., "notizia", "approfondimento", "analisi", "editoriale", "opinione", "intervista")
- contesto_geografico: the geographic area discussed (e.g., "Italia", "Europa", "globale")
- validita_temporale: how long the insights will remain relevant ("breve termine", "medio termine", "lungo termine")
- target_audience: the intended audience (e.g., "executive", "marketer", "organizzatore eventi", "atleti")
- entita_rilevanti: array of people, organizations or clubs mentioned (e.g., ["FIFA", "Spotify", "FC Barcelona"])

---

📦 **Output Format (JSON)**

Return a valid JSON object in the following format:

{
  "analisi_leggibilita": {
    "punteggio_flesch_kincaid": 76,
    "tempo_di_lettura_minuti": 2,
    "spiegazione": "Il testo presenta un linguaggio accessibile con frasi semplici e struttura lineare."
  },
  "rilevazione_di_pregiudizio": {
    "tipo_di_pregiudizio": 3,
    "grado_di_pregiudizio": 18,
    "spiegazione": "L’articolo enfatizza i benefici economici per le grandi leghe, minimizzando gli impatti sui piccoli club."
  },
  "rilevazione_emozioni": {
    "emozioni": {
      "gioia": 35,
      "tristezza": 5,
      "rabbia": 10,
      "paura": 15,
      "sorpresa": 40
    },
    "spiegazione": "Il testo alterna ottimismo e incertezza, con enfasi su cambiamenti tecnologici e strategie future."
  },
  "tags": ["Marketing", "Media"],
  "takeaways": [
    "Le piattaforme OTT stanno ridefinendo i modelli di distribuzione dei contenuti sportivi.",
    "Il valore delle sponsorship aumenta con format digitali più coinvolgenti.",
    "L'adozione di AI nei media sportivi offre nuove opportunità di personalizzazione.",
    "Le strategie di contenuto stanno superando il semplice broadcasting.",
    "La misurazione dell'engagement è ora centrale nella valutazione del ROI."
  ],
  "cleanText": "piattaforme ott distribuzione contenuti sportivi sponsorship ai media engagement broadcasting personalizzazione strategia roi",
  "scopo": "analizzare",
  "tesi_principale": "Le tecnologie digitali stanno rivoluzionando il modo in cui lo sport viene distribuito, monetizzato e vissuto dai fan.",
  "concetti_chiave": ["piattaforme OTT", "sponsorship", "AI", "personalizzazione", "ROI"],
  "orizzonte_temporale": "attualità",
  "dominio": "Sport Business",
  "tipo_contenuto": "approfondimento",
  "contesto_geografico": "globale",
  "validita_temporale": "medio termine",
  "target_audience": "marketer",
  "entita_rilevanti": ["DAZN", "TikTok", "Serie A"]
}
`

module.exports.sentimentAnalysisPrompt = sentimentAnalysisPrompt

const askAgentPrompt = (question) => `
Rispondi alla seguente domanda agendo come un esperto di sport business:

**Domanda:** ${question}

---

**Contesto disponibile:**  
Hai accesso a una serie di articoli analizzati in profondità tramite strumenti di NLP. Ogni documento include informazioni sintetiche su:
- Tesi principali e concetti chiave
- Argomenti trattati e tag tematici
- Emozioni e tono del contenuto
- Entità rilevanti (organizzazioni, club, aziende)
- Obiettivo comunicativo, target di riferimento, validità temporale
- Estratto testuale e punteggio di similarità

---

**Istruzioni per Gemini:**
• Agisci come un esperto di sport business.  
• Considera che l'utente è un professionista del settore, con conoscenze di base, ma desideroso di approfondire.  
• Sintetizza e confronta i contenuti degli articoli per costruire una risposta coerente e utile.  
• Non citare le fonti testualmente, ma ragiona a partire dai concetti emersi.  
• Spiega il ragionamento alla base delle tue affermazioni e collega i principi chiave dello sport business ai concetti presenti negli articoli.  
• Mantieni un tono analitico e professionale, focalizzato su dati, strategie e implicazioni.  
• Fornisci esempi, buone pratiche o possibili scenari, anche quando non esplicitamente richiesti.  
• Anticipa eventuali domande di approfondimento e suggerisci temi correlati da esplorare.  
• Inizia la risposta con una frase riassuntiva che esprima il concetto chiave.  
• Struttura la risposta in modo chiaro, logico e leggibile.

---

**Rispondi in formato JSON** con questa struttura:

{
  "answer": "Risposta completa, coerente e ben strutturata qui..."
}
`

module.exports.askAgentPrompt = askAgentPrompt
