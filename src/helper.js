const { collection, getDocs, setDoc, doc } = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")

const helper = async () => {
  const http = rateLimit(axios.create(), {
    maxRequests: 5,
    perMilliseconds: 60000
  })
  http.getMaxRPS() // 2

  let alreadyDone = []
  const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
  const alreadyDoneSnap = await getDocs(collection(firebaseApp, "sentiment"))

  alreadyDoneSnap.forEach((doc) => {
    alreadyDone.push(doc.id)
  })

  console.log(alreadyDone.length)

  dbSnapshot.forEach((post) => {
    if (!alreadyDone.includes(post.id)) {
      http
        .get(`http://localhost:4000/getSentimentAnalysis`, {
          params: {
            id: post.id
          }
        })
        .then(() => console.log("done " + post.id))
    }
  })
}

const helper2 = async () => {
  const http = rateLimit(axios.create(), {
    maxRequests: 5,
    perMilliseconds: 60000
  })
  http.getMaxRPS() // 2

  let alreadyDone = []
  const dbSnapshot = await getDocs(collection(firebaseApp, "sentiment"))
  const alreadyDoneSnap = await getDocs(collection(firebaseApp, "preview"))

  alreadyDoneSnap.forEach((post) => {
    alreadyDone.push(post.id)
  })

  console.log(alreadyDone.length)

  dbSnapshot.forEach((post) => {
    if (!alreadyDone.includes(post.id)) {
      setDoc(doc(firebaseApp, "preview", post.id), {
        id: post.id,
        coherence:
          post.data().analysis?.analisi_coesione_coerenza?.punteggio_coerenza,
        prejudice:
          post.data().analysis?.rilevazione_di_pregiudizio
            ?.grado_di_pregiudizio,
        readability:
          post.data().analysis?.analisi_leggibilità?.punteggio_flesch_kincaid,
        url: post.data().url,
        title: post.data().title,
        date: post.data().date,
        author: post.data().author
      })
    }
  })
}

helper2()
