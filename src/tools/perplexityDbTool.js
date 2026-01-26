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

async function findExistingPost(docId) {
  const postRef = firestore.collection("posts").doc(docId)
  const postSnap = await postRef.get()
  if (postSnap.exists) {
    return postSnap.data()
  }
  return null
}

async function savePerplexityArticle(article) {
  const normalized = normalizeArticle(article)
  const existing = await findExistingPost(normalized.id)
  if (existing) {
    return existing
  }
  await firestore
    .collection("posts")
    .doc(normalized.id)
    .set(normalized, { merge: true })
  return normalized
}

const perplexityDbTool = tool({
  description:
    "Salva uno o più articoli Perplexity nel database, deduplicando per ID stabile (URL/titolo).",
  inputSchema: z.object({
    articles: z.array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        url: z.string().optional(),
        snippet: z.string().optional(),
        date: z.string().optional(),
        body: z.string().optional(),
        excerpt: z.string().optional(),
        imgLink: z.string().optional(),
        author: z.string().optional(),
        processed: z.boolean().optional(),
        createdAt: z.any().optional()
      })
    )
  }),
  execute: async ({ articles }) => {
    const results = await Promise.all(articles.map(savePerplexityArticle))
    return results
  }
})

module.exports = { perplexityDbTool, normalizeArticle }
