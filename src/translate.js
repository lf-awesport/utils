const { TranslationServiceClient } = require("@google-cloud/translate")
const dotenv = require("dotenv")
const path = require("path")
dotenv.config({ path: path.join(__dirname, "..", ".env") })

const projectId = process.env.PROJECT_ID
const location = process.env.LOCATION

const initTranslationClient = () => new TranslationServiceClient()

async function translateText(client, text, out) {
  const request = {
    parent: `projects/${projectId}/locations/${location}`,
    contents: [text],
    mimeType: "text/plain",
    sourceLanguageCode: "it",
    targetLanguageCode: out
  }

  const [response] = await client.translateText(request)

  //   for (const translation of response.translations) {
  //     console.log(`Translation: ${translation.translatedText}`)
  //   }

  return response.translations[0].translatedText
}

module.exports.initTranslationClient = initTranslationClient
module.exports.translateText = translateText
