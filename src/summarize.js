const { VertexAI } = require("@google-cloud/vertexai")
const { summarizePrompt } = require("./prompts")

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({
  project: "useful-ward-428507-a0",
  location: "us-central1"
})
const model = "gemini-1.5-pro-001"

// Instantiate the models
const generativeModel = vertex_ai.preview.getGenerativeModel({
  model: model,
  generationConfig: {
    maxOutputTokens: 600,
    temperature: 0.2,
    topP: 0.8
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
        text: summarizePrompt
      }
    ]
  }
})

async function summarizeContent(content) {
  const text1 = {
    text: content
  }

  const req = {
    contents: [{ role: "user", parts: [text1] }]
  }

  const streamingResp = await generativeModel.generateContentStream(req)

  const rawSummary = (
    await streamingResp.response
  ).candidates[0].content.parts[0].text
    .split("```json")[1]
    .split("```")[0]

  return JSON.parse(rawSummary)
}

module.exports.summarizeContent = summarizeContent
