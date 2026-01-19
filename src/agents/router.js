const { gemini } = require("../gemini")
const z = require("zod")

const routerSchema = z.object({
  tools: z
    .array(z.enum(["rag", "perplexity"]))
    .describe("List of tools to execute. Empty if none needed."),
  reasoning: z.string().describe("Brief explanation of the decision")
})

const routerSystemPrompt = `
Sei un Router Intelligente per un assistente AI di Sport Business.
Analizza la richiesta dell'utente e la cronologia recente per decidere se servono strumenti di ricerca esterna.

STRUMENTI DISPONIBILI:
- "rag": Per cercare nel database interno (documenti caricati, knowledge base aziendale).
- "perplexity": Per cercare sul web notizie recenti, dati finanziari in tempo reale o eventi correnti.

CRITERI DI DECISIONE:
1. NO TOOLS ([]):
   - Saluti ("Ciao", "Buongiorno").
   - Complimenti o feedback ("Grazie", "Sei stato utile").
   - Domande su cosa sa fare l'AI ("Chi sei?", "Cosa puoi fare?").
   - Riferimenti a cose già dette nella conversazione immediata (Anafore: "Spiegami meglio il punto 2").
   - Domande di logica pura o chiacchiere che non richiedono dati esterni.
   - **DOMANDE PERSONALI o SULLA MEMORIA**: Se l'utente chiede "Come mi chiamo?", "Cosa ti ho detto prima?", "Cosa sai di me?", "Chi sono?", "Riassumi la nostra chat", NON usare tools. La memoria della chat è già inclusa nel contesto base.

2. USA TOOLS (["rag", "perplexity"]):
   - Domande fattuali su eventi, persone, aziende, partite.
   - Richieste di dati, statistiche, analisi di mercato.
   - Domande che richiedono conoscenza aggiornata o specifica ("Chi ha vinto ieri?", "Analisi bilancio Inter").
   - Se l'utente chiede "cosa sai di [ENTITA' ESTERNA]", usa i tools. Se chiede "cosa sai di [ME/UTENTE]", NON usare tools.
   - Se hai il DUBBIO, usa SEMPRE i tools. Meglio cercare che allucinare.

Rispondi in JSON.
`

async function toolRouter({ query, history }) {
  const content = `
User Query: ${query}
Recent History Summary: ${history || "None"}
`
  try {
    const result = await gemini(content, routerSystemPrompt, 500, routerSchema)
    return result
  } catch (error) {
    console.error("Router error, defaulting to all tools:", error)
    // Fallback: se il router fallisce, cerchiamo per sicurezza
    return { tools: ["rag", "perplexity"], reasoning: "Error fallback" }
  }
}

module.exports = { toolRouter }
