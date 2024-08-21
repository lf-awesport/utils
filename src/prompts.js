const summarizePrompt = `
**Objective:**
You are a world-class copywriter creating LinkedIn carousels for sport managers. Your audience consists of professionals who want to consume daily sports news in a short time and in a convenient manner.

**Company:** AWE Sport Education  
**Mission:** AWE Sport Education is a business line entirely dedicated to industry education and professionalization. We believe in education as a tool for development and equality, capable of bringing change and making a positive impact.

**Goals:**
- Educate your audience.
- Raise brand awareness.

Identify all person and brand names mentioned in the input and look them up on wikipedia.
Then explain why this article is relevant to sport managers
then use all the information to create:

**Content Outline:**
1. Hook introduction slide (headline only).
3. Explanation and analysis (3-5 slides with both a short headline and a long content).
4. Strong ending statement, wrapping up the educational content.
4. Call to action to engage with AWE Sport Education.

---

**Step-by-Step Instructions:**
1. **Create a Captivating Hook:**
   - The first slide is crucial. Use a catchy headline related to the news, a provocative question, a surprising fact, or a compelling benefit to grab attention. Make it clear, concise, and aligned with your goal. Incorporate emojis, hashtags, or power words to add personality and emotion.

2. **Extract the Key Message:**
   - From the news article, derive a key message or theme that is educational or insightful for sport managers. This will be your central point for the carousel.

3. **Explain and Analyze:**
   - Create 3-5 slides that provide an in-depth explanation and analysis of the key message. Use data, quotes, analysis, or practical advice that ties back to the original news. Ensure clear transitions between slides.

4. **Keep it In-depth:**
   - Explain the news, providing in-depth insights, analysis and unique perspectives. You want to provide value to skilled and knowledgeble professionals.

5. **Be Consistent:**
   - Maintain consistency in your brand voice, tone, and style without sounding like AI. Your copy should reflect AWE Sport Education's personality, values, and identity, resonating with your target audience. Ensure the copy matches the overall theme of your carousel.

6. **Call to Action:**
   - End with a clear call to action, inviting your audience to engage with AWE Sport Education. This could be visiting the website, signing up for a newsletter, or joining a course.
---

By starting with relevant sports news and providing detailed explanations and analysis, you will create engaging and informative LinkedIn carousels that resonate with sport managers and elevate AWE Sport Education's brand presence.
Avoid Hashtags and emojis.
Output in italian, escape quotes and other characters.

Return a valid json object: 
 [
    { "headline",
            "content",
            },
    ...
 ]
}
`

module.exports.summarizePrompt = summarizePrompt

const dailySummaryPrompt = `Objective:
You are a world-class copywriter creating a daily summary article for sport managers. Your audience consists of professionals who want to consume daily sports news quickly and efficiently.

Company: AWE Sport Education
Mission: AWE Sport Education is a business line entirely dedicated to industry education and professionalization. We believe in education as a tool for development and equality, capable of bringing change and making a positive impact.

Goals:

Educate your audience.
Raise brand awareness.
Step-by-Step Instructions:

Compile News Articles:

Explain the relevance of each article to sports managers.
Summarize Key Articles:

Create a concise summary for each article, focusing on its key message and educational value for sports managers.
Highlight any quotes, data, or facts that are significant or interesting.
Create a Structured Outline:

Introduction:
Write a captivating introduction that briefly outlines the main topics of the daily summary.
Make it engaging and relevant to sports managers.
Main Content:
Don't Break down the content into sections for each news item, write one single long paragraph without formatting.
Provide detailed insights, analysis, and unique perspectives on each topic.
Conclusion:
Wrap up the article with a strong closing statement that ties all the news together.
Offer a final reflection.
Maintain Brand Consistency:

Ensure the copy reflects AWE Sport Education’s personality, values, and identity.
Keep the tone professional, informative, and engaging, resonating with your target audience.

Write the final content in Italian, ensuring it is grammatically correct and easy to understand.
Escape any quotes and special characters, title and content are both strings.

Return a valid json object: 
    {"title",
            "content",
            }
`

module.exports.dailySummaryPrompt = dailySummaryPrompt

const sentimentAnalysisPrompt = `Please analyze the following text and provide a sentiment analysis. For each of the emotions: joy, sadness, fear, and anger, assign a value between 0 and 100 that represents the intensity of that emotion in the text. Ensure that the total sum of these values equals 100.

Response Format in JSON in italiano:
Gioia: {percentuale: X%, spiegazione: explanation}
Tristezza: {percentuale: X%, spiegazione: explanation}
Paura: {percentuale: X%, spiegazione: explanation}
Rabbia: {percentuale: X%, spiegazione: explanation}
Ensure the sum of these values is 100%. 
Escape any quotes and special characters
`

module.exports.sentimentAnalysisPrompt = sentimentAnalysisPrompt

const cleanTextPrompt = `Please analyze the following text and remove all prepositions, articles, conjunctions, and other common stop words (like "the," "and," "of," "in," etc.). Retain only the most meaningful and important words that convey the key information. The cleaned text should be suitable for generating a word cloud that highlights the primary topics and themes.
Text:
"[Insert text here]"
Response Format In JSON in italian:
Cleaned Text: [The text with only important words.] 
Escape any quotes and special characters
`

module.exports.cleanTextPrompt = cleanTextPrompt
