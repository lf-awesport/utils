const { firestore } = require("./../firebase")

async function removeDuplicateUrls({ dryRun = true } = {}) {
  const collections = ["posts", "sentiment"]

  for (const collection of collections) {
    console.log(`📂 Checking duplicates in "${collection}"...`)
    const snapshot = await firestore.collection(collection).get()

    const seenUrls = new Set()
    const seenTitles = new Set()
    const duplicates = []

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const url = data.url?.trim()
      const title = data.title?.trim()

      if (!url && !title) continue

      const isUrlDuplicate = url && seenUrls.has(url)
      const isTitleDuplicate = title && seenTitles.has(title)

      if (isUrlDuplicate || isTitleDuplicate) {
        duplicates.push({ ref: doc.ref, id: doc.id, url, title })
      } else {
        if (url) seenUrls.add(url)
        if (title) seenTitles.add(title)
      }
    }

    console.log(`🔎 Found ${duplicates.length} duplicates in "${collection}"`)

    if (dryRun) {
      duplicates.forEach((d) =>
        console.log(
          `🚫 [dryRun] Would delete ${d.id} — Title: "${d.title}", URL: ${d.url}`
        )
      )
    } else {
      const batchSize = 500
      for (let i = 0; i < duplicates.length; i += batchSize) {
        const batch = firestore.batch()
        duplicates
          .slice(i, i + batchSize)
          .forEach(({ ref }) => batch.delete(ref))
        await batch.commit()
        console.log(
          `✅ Deleted batch of ${Math.min(batchSize, duplicates.length - i)} from "${collection}"`
        )
      }
    }
  }

  console.log(
    `🏁 Done! ${dryRun ? "No documents were deleted (dry run)." : "Duplicates removed."}`
  )
}

removeDuplicateUrls({ dryRun: false })
