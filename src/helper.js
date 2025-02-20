const { collection, getDocs, setDoc, doc } = require("firebase/firestore")
const { firebaseApp } = require("./firebase.js")
const axios = require("axios")
const rateLimit = require("axios-rate-limit")

const helper = async () => {
  try {
    const http = rateLimit(axios.create(), {
      maxRequests: 2,
      perMilliseconds: 60000
    })
    http.getMaxRPS()

    let alreadyDone = []
    const dbSnapshot = await getDocs(collection(firebaseApp, "posts"))
    const alreadyDoneSnap = await getDocs(collection(firebaseApp, "sentiment"))

    alreadyDoneSnap.forEach((doc) => {
      alreadyDone.push(doc.id)
    })

    dbSnapshot.forEach((post) => {
      if (!alreadyDone.includes(post.id)) {
        http
          .get(`http://localhost:4000/getSentimentAnalysis`, {
            params: {
              id: post.id
            }
          })
          .then(() => console.log("sentiment: " + post.id))
      }
    })
  } catch (e) {
    console.log(e)
  }
}

module.exports.helper = helper

helper()
