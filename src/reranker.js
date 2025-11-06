// src/utils/reranker.js
const axios = require("axios")
require("dotenv").config({ path: require("find-config")(".env") })
const { GoogleAuth } = require("google-auth-library")

// --- CONFIGURAZIONE API ---
const PROJECT_ID = process.env.PROJECT_ID
const LOCATION = "global"
const RANKING_CONFIG_ID = "default_ranking_config"
const MODEL_NAME = "semantic-ranker-default@latest"

// Variabili d'ambiente per la Service Account (chiavi separate)
const CLIENT_EMAIL = process.env.CLIENT_EMAIL
// La chiave privata è spesso quotata nel file .env; assicuriamoci che sia pulita
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? process.env.PRIVATE_KEY.replace(/\\n/g, "\n")
  : null

// Lo scope necessario per Discovery Engine/Vertex AI Search
const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

// 💡 LOGICA DI AUTENTICAZIONE ADATTATA PER CHIAVI SEPARATE
let authOptions = { scopes: SCOPES }

if (CLIENT_EMAIL && PRIVATE_KEY) {
  // Se le chiavi separate sono disponibili (scenario di produzione/Service Account)
  authOptions.credentials = {
    client_email: CLIENT_EMAIL,
    private_key: PRIVATE_KEY
  }
  console.log(
    "Credenziali caricate da CLIENT_EMAIL/PRIVATE_KEY (Service Account)."
  )
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  // Fallback all'uso del JSON intero (se lo hai definito, Opzione B precedente)
  try {
    authOptions.credentials = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    )
    console.log("Credenziali caricate da GOOGLE_APPLICATION_CREDENTIALS_JSON.")
  } catch (e) {
    console.error("Errore nel parsing della chiave Service Account JSON.")
  }
} else {
  // Fallback all'ADC (gcloud auth application-default login)
  console.log(
    "Uso Application Default Credentials (ADC). Assicurati di essere loggato con gcloud."
  )
}

// Inizializza il client di autenticazione.
const auth = new GoogleAuth(authOptions)

/**
 * Genera il token di accesso necessario per le API di Google Cloud.
 * @returns {Promise<string>} Il token di accesso.
 */
async function getAccessToken() {
  const client = await auth.getClient()
  const accessToken = await client.getAccessToken()

  if (!accessToken || !accessToken.token) {
    throw new Error(
      "Impossibile ottenere il token di accesso. Controlla le credenziali (Service Account, ADC, e permessi)."
    )
  }
  return accessToken.token
}

/**
 * Esegue la chiamata all'API di Reranking di Vertex AI Search.
 */
async function rerankDocuments(userQuery, documents) {
  const url = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/rankingConfigs/${RANKING_CONFIG_ID}:rank`

  const apiRecords = documents.map((doc) => ({
    id: doc.id,
    title: doc.title || "",
    content: doc.rerank_summary
  }))

  const finalRecords = apiRecords.slice(0, 200)

  if (finalRecords.length === 0) {
    console.warn("Nessun record valido da inviare al reranker.")
    return []
  }

  const payload = {
    model: MODEL_NAME,
    query: userQuery,
    records: finalRecords,
    topN: 25,
    ignoreRecordDetailsInResponse: true
  }

  console.log(
    `\nInvio ${finalRecords.length} record per il reranking con la query: "${userQuery.substring(0, Math.min(userQuery.length, 40))}..."`
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
    return response.data.records
  } catch (error) {
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
