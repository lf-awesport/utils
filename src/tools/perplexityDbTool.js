const { tool } = require("ai")
const z = require("zod")
const { firestore } = require("../services/firebase")
const rng = require("seedrandom")

function generateId(seed) {
  return rng(seed)().toString()
}

function normalizeArticle(article) {
  const {
    id,
    title,
    url,
    snippet,
    date,
    body,
    excerpt,
    imgLink,
    author,
    processed,
    createdAt
  } = article
  const cleanTitle = title?.trim() || ""
  const cleanUrl = url?.trim() || ""
  const docId = id || generateId(cleanTitle || cleanUrl)
  return {
    id: docId,
    title: cleanTitle,
    url: cleanUrl,
    body: body || snippet || "",
    excerpt: excerpt || snippet?.split("\n")[0] || snippet || "",
    date: date || null,
    imgLink: imgLink || null,
    author: author || "Perplexity",
    processed: processed || false,
    createdAt: createdAt || new Date()
  }
}

async function findExistingPost(url, title) {
  // Gli articoli sono già normalizzati e con id
  const postRef = firestore.collection("posts").doc(url)
  const postSnap = await postRef.get()
  if (postSnap.exists) {
    return postSnap.data()
  }
  return null
}

async function savePerplexityArticle(article) {
  const existing = await findExistingPost(article.id)
  if (existing) {
    return existing
  }
  await firestore
    .collection("posts")
    .doc(article.id)
    .set(article, { merge: true })
  return article
}

const perplexityDbTool = tool({
  description:
    "Salva uno o più articoli Perplexity nel database, deduplicando per URL/titolo.",
  inputSchema: z.object({
    articles: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        date: z.string().optional()
      })
    )
  }),
  execute: async ({ articles }) => {
    const results = await Promise.all(articles.map(savePerplexityArticle))
    return results
  }
})

module.exports = { perplexityDbTool, normalizeArticle }
