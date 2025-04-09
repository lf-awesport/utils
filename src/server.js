const express = require("express")
const cors = require("cors")
const cron = require("node-cron")

const {
  processArticles,
  batchUpdateRecommendations
} = require("./embeddings.js")

const { unifiedScraper } = require("./scraper.js")

const app = express()
app.use(cors())

// // 🧠 Ask Agent using related articles
// app.get("/askAgentAboutArticle", async (req, res) => {
//   const postId = req.query.id
//   const question = req.query.q
//   try {
//     const currentPostSnap = await getDoc(doc(firestore, "sentiment", postId))
//     const currentPost = currentPostSnap.data()

//     if (!currentPost || !currentPost.relatedArticles) {
//       return res
//         .status(404)
//         .json({ error: "Article or related articles not found" })
//     }

//     const relatedIds = currentPost.relatedArticles.map((r) => r.id)
//     const relatedSnaps = await Promise.all(
//       relatedIds.map((id) => getDoc(doc(firestore, "sentiment", id)))
//     )

//     const related = relatedSnaps
//       .map((snap) => snap.data())
//       .filter((d) => d !== undefined)

//     const context = related
//       .map((a) => {
//         return `
// TITOLO: ${a.title}
// AUTORE: ${a.author}
// DATA: ${a.date}
// TAGS: ${Array.isArray(a.tags) ? a.tags.join(", ") : ""}
// ESTRATTO: ${a.excerpt}
// BODY: ${a.analysis?.cleanText || ""}
// `
//       })
//       .join("\n-----------------------------\n")

//     const result = await summarizeContent(context, askAgentPrompt(question))
//     res.json(result)
//   } catch (error) {
//     console.error("askAgentAboutArticle error", error)
//     res.status(500).json({ error: error.message })
//   }
// })

// 📦 Aggiorna articoli (scraping + analisi + embeddings)
app.get("/update", async (req, res) => {
  try {
    await unifiedScraper()
    await processArticles()
    await batchUpdateRecommendations()
    res.status(200).send("✅ Update complete!")
  } catch (error) {
    console.error("❌ Error during update:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🧪 Test endpoint
app.get("/test", (req, res) => {
  res.send("✅ Server is running correctly!")
})

// 🚀 Avvio locale o export per Vercel
if (require.main === module) {
  app.listen(4000, () => {
    console.log("Server listening on port 4000")
  })
}

// 🔁 Esegui aggiornamento ogni 12 ore (alle 00:00 e alle 12:00)
cron.schedule("0 */12 * * *", async () => {
  console.log("🕒 Cron job started: updating articles + embeddings")
  try {
    await unifiedScraper()
    await processArticles()
    await batchUpdateRecommendations()
    console.log("✅ Cron job completed")
  } catch (e) {
    console.error("❌ Cron job error:", e)
  }
})

module.exports = app
