const { VertexAI } = require("@google-cloud/vertexai")
const { json } = require("express")
require("dotenv").config({ path: require("find-config")(".env") })
const { jsonrepair } = require("jsonrepair")

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({
  project: process.env.PROJECT_ID,
  location: process.env.LOCATION
})
const model = process.env.MODEL

// Instantiate the models
const generativeModel = (prompt) =>
  vertex_ai.preview.getGenerativeModel({
    model: model,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0,
      topP: 0
    },
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
    ],
    systemInstruction: {
      parts: [
        {
          text: prompt
        }
      ]
    }
  })

async function summarizeContent(content, prompt) {
  try {
    const text1 = {
      text: content
    }

    const req = {
      contents: [{ role: "user", parts: [text1] }]
    }

    const model = generativeModel(prompt)

    const streamingResp = await model.generateContentStream(req)

    const rawSummary = (
      await streamingResp.response
    ).candidates[0].content.parts[0].text
      .split("```json")[1]
      .split("```")[0]

    return JSON.parse(jsonrepair(rawSummary))
  } catch (e) {
    console.log(e)
  }
}

module.exports.summarizeContent = summarizeContent
