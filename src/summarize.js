const { createVertex } = require("@ai-sdk/google-vertex")
const { json } = require("express")
require("dotenv").config({ path: require("find-config")(".env") })
const { jsonrepair } = require("jsonrepair")
const { generateText } = require("ai")

// Initialize Vertex with your Cloud project and location
const vertex_ai = createVertex({
  project: process.env.PROJECT_ID,
  location: process.env.LOCATION,
  googleAuthOptions: {
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY
    }
  }
})

// Instantiate the models
const generativeModel = vertex_ai(process.env.MODEL, {
  safetySettings: [
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    }
  ]
})

async function summarizeContent(content, prompt) {
  try {
    const { text } = await generateText({
      model: generativeModel,
      system: prompt,
      prompt: content,
      maxTokens: 8192,
      temperature: 0,
      topP: 0
    })

    const rawSummary = text.split("```json")[1].split("```")[0]

    return JSON.parse(jsonrepair(rawSummary))
  } catch (e) {
    console.log(e)
  }
}

module.exports.summarizeContent = summarizeContent
