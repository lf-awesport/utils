const { createVertex } = require("@ai-sdk/google-vertex")
require("dotenv").config({ path: require("find-config")(".env") })
const { generateObject } = require("ai")

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
  structuredOutputs: true,
  temperature: 0,
  topP: 0,
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

async function gemini(content, prompt, maxTokens, schema) {
  try {
    const { object } = await generateObject({
      model: generativeModel,
      system: prompt,
      prompt: content,
      maxTokens,
      schema
    })

    return object
  } catch (e) {
    console.log(e)
  }
}

module.exports.gemini = gemini
