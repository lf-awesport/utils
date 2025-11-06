// src/utils/reranker.js
const axios = require("axios")
require("dotenv").config({ path: require("find-config")(".env") })
const { GoogleAuth } = require("google-auth-library")

// --- CONFIGURAZIONE API ---
// ⚠️ SOSTITUISCI QUESTI VALORI CON I TUOI DATI REALI
const PROJECT_ID = process.env.PROJECT_ID
const LOCATION = "global" // O la tua regione
const RANKING_CONFIG_ID = "default_ranking_config"
const MODEL_NAME = "semantic-ranker-default@latest"

// Lo scope necessario per Discovery Engine/Vertex AI Search
const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

// Inizializza il client di autenticazione
const auth = new GoogleAuth({ scopes: SCOPES })

/**
 * Genera il token di accesso necessario per le API di Google Cloud.
 * Utilizza la logica delle credenziali predefinite (Application Default Credentials).
 * @returns {Promise<string>} Il token di accesso.
 */
async function getAccessToken() {
  const client = await auth.getClient()
  const accessToken = await client.getAccessToken()
  // Il token di accesso è contenuto nella proprietà 'token'
  if (!accessToken || !accessToken.token) {
    throw new Error(
      "Impossibile ottenere il token di accesso. Controlla le credenziali."
    )
  }
  return accessToken.token
}

/**
 * Esegue la chiamata all'API di Reranking di Vertex AI Search per ordinare i documenti.
 * * @param {string} userQuery - La query dell'utente da usare per il reranking.
 * @param {Array<Object>} documents - Gli articoli candidati recuperati da Firestore.
 * @param {string} documents[].id - ID univoco del documento Firestore.
 * @param {string} documents[].title - Titolo dell'articolo.
 * @param {string} documents[].rerank_summary - Il riassunto generato da Gemini.
 * @returns {Promise<Array<Object>>} L'elenco degli articoli ordinati con i loro score.
 */
async function rerankDocuments(userQuery, documents) {
  // Endpoint basato sulla documentazione Vertex AI Search
  const url = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/rankingConfigs/${RANKING_CONFIG_ID}:rank`

  // Mappa i tuoi documenti nel formato 'records' richiesto dall'API
  // Il campo 'content' è il tuo 'rerank_summary'
  const apiRecords = documents.map((doc) => ({
    id: doc.id,
    title: doc.title || "",
    content: doc.rerank_summary
  }))

  // Il limite massimo è 200 record per richiesta.
  const finalRecords = apiRecords.slice(0, 200)

  const payload = {
    model: MODEL_NAME,
    query: userQuery,
    records: finalRecords,
    topN: 10, // Restituisce i primi N risultati più rilevanti
    ignoreRecordDetailsInResponse: true // Opzionale: riduce il payload di risposta
  }

  console.log(
    `\nInvio ${finalRecords.length} record per il reranking con la query: "${userQuery.substring(0, 40)}..."`
  )

  try {
    const accessToken = await getAccessToken()

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": PROJECT_ID
      }
    })

    console.log(
      `Rerank completato. Ricevuti ${response.data.records.length} risultati ranked.`
    )
    // response.data.records è l'array ordinato: [{id: "...", score: 0.98}, ...]
    return response.data.records
  } catch (error) {
    // Log dettagliato dell'errore
    if (error.response) {
      console.error(
        `\n🚨 Errore API di Reranking (${error.response.status}):`,
        error.response.data
      )
    } else {
      console.error(
        "\n🚨 Errore generico durante la chiamata all'API di Reranking:",
        error.message
      )
    }
    throw new Error("Reranking API call failed.")
  }
}

module.exports = { rerankDocuments }
