const { tool } = require("ai")
const z = require("zod")
const { firestore } = require("../firebase")
const rng = require("seedrandom")

function generateId(seed) {
  return rng(seed)().toString()
}

async function findExistingPost(url, title) {
  const cleanUrl = url?.trim()
  const cleanTitle = title?.trim()
  const id = generateId(title || url)
  const postRef = firestore.collection("posts").doc(id)
  const postSnap = await postRef.get()
  if (postSnap.exists) {
    const existing = postSnap.data()
    const sameUrl = existing.url?.trim() === cleanUrl
    const sameTitle = existing.title?.trim() === cleanTitle
    if (sameUrl || sameTitle) {
      return existing
    }
    return existing
  }
  if (cleanUrl) {
    const urlSnap = await firestore
      .collection("posts")
      .where("url", "==", cleanUrl)
      .limit(1)
      .get()
    if (!urlSnap.empty) return urlSnap.docs[0].data()
  }
  if (cleanTitle) {
    const titleSnap = await firestore
      .collection("posts")
      .where("title", "==", cleanTitle)
      .limit(1)
      .get()
    if (!titleSnap.empty) return titleSnap.docs[0].data()
  }
  return null
}

async function savePerplexityArticle(article) {
  const { title, url, snippet, date } = article
  const cleanTitle = title?.trim()
  const cleanUrl = url?.trim()
  const id = generateId(cleanTitle || cleanUrl)
  const existing = await findExistingPost(cleanUrl, cleanTitle)
  if (existing) return existing
  const postData = {
    id,
    title: cleanTitle,
    url: cleanUrl,
    body: snippet,
    excerpt: snippet?.split("\n")[0] || snippet,
    date,
    imgLink: null,
    author: "Perplexity",
    processed: false,
    createdAt: new Date()
  }
  await firestore.collection("posts").doc(id).set(postData, { merge: true })
  return postData
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
    const results = []
    for (const article of articles) {
      const post = await savePerplexityArticle(article)
      results.push(post)
    }
    return results
  }
})

module.exports = { perplexityDbTool }
