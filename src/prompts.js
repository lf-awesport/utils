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
3. Explanation and analysis (3-4 slides maximum).
4. Strong ending statement, wrapping up the educational content.
4. 1 Call to action slide to engage with AWE Sport Education's audience.

---

**Step-by-Step Instructions:**
1. **Create a Captivating Hook:**
   - The first slide is crucial. Use a catchy headline related to the news, a provocative question, a surprising fact, or a compelling benefit to grab attention. Make it clear, very concise (max 4-5 words), and aligned with your goal.

2. **Extract the Key Message:**
   - From the news article, derive a key message or theme that is educational or insightful for sport managers. This will be your central point for the carousel.

3. **Explain and Analyze:**
   - Create 3-5 slides that provide an in-depth explanation and analysis of the key message. Use data, quotes, analysis, or practical advice that ties back to the original news. Ensure clear transitions between slides.

4. **Keep it In-depth:**
   - Explain the news, providing in-depth insights, analysis and unique perspectives. You want to provide value to skilled and knowledgeble professionals.

5. **Be Consistent:**
   - Maintain consistency in your brand voice, tone, and style without sounding like AI. Your copy should reflect AWE Sport Education's personality, values, and identity, resonating with your target audience. Ensure the copy matches the overall theme of your carousel.

6. **Reasonable Length:**
   - Maintain In-depth analysis withouth printing too much text, everything should be readable and look decent in a slide 1080x1350px big. Not too full, not too empty.

7. **Call to Action:**
   - End with a clear call to action, inviting your audience to engage with AWE Sport Education. This could be visiting the website, signing up for a newsletter, or joining a course.
---

By starting with relevant sports news and providing detailed explanations and analysis, you will create engaging and informative LinkedIn carousels that resonate with sport managers and elevate AWE Sport Education's brand presence.
Avoid Hashtags and emojis.
Output in italian, escape quotes and other characters.

Return a valid json object: 
 [
    { 
      "content",
    ...
 ]
}
`

module.exports.summarizePrompt = summarizePrompt

const sentimentAnalysisPrompt = `Please analyze the following text and provide a detailed JSON response that includes the following aspects:
Readability Analysis: Determine the readability level of the text, using metrics such as the Flesch-Kincaid score or other readability indices.
Bias Detection: Identify any potential bias present in the article, such as political bias or agenda-driven content. Indicate the type and degree of bias detected.
Emotion Detection: Identify the specific emotions conveyed in the article, such as joy, sadness, anger, fear, etc., and provide their intensity levels.
Tags: assign one or more tags strictly from the provided sports-related categories. Each article should be tagged based on the primary topics it covers, with a focus on precise classification. Use only the categories from the list below:

Categories: only the following: [Sports Law, Finance, Esport, Event Management, Marketing, Sponsorship, Sport for Good, Sport Equipment, Sport Tourism, Media, Fan Experience]

Sports Law:
Organisation and structure of the ICAS and CAS
World Anti-Doping Agency (WADA)
Match-fixing and corruption in sports
Code of Sports-related Arbitration
Compliance and Anti-Doping Regulations
FIFA Compliance Programme

Finance:
Financial reporting and management
Accounting in sport
Statutory financial requirements in sport
Financial risk management
Club financial management
Financial Fair Play

Esport:
eSport World and stakeholders
eSport marketing
Sponsorship in eSport
eSport events and tournaments
eSport and education
Legal aspects of eSport

Event Management:
Sport event planning and strategy
Organisational structure for sports events
Financial planning for events
Venue and facilities management
Risk and security management

Fan Experience:
Fan classification and loyalty
Fan engagement strategies
Digital fan experience and new technologies
Artificial Intelligence (AI) and sports
Ticketing and membership

Sport Tourism:
Event sport tourism (e.g., Olympics, FIFA World Cup)
Active sport tourism (winter/summer destinations)
Nostalgia sport tourism

Sport Equipment:
Sports equipment market and technology
Wearable technology in sports
Smart sport equipment

Marketing:
Sport marketing strategies
Experiential marketing
Branding and fan experience

Sponsorship:
Sponsorship models in sport
Technical sponsorship
Commercial activations

Media:
Sports media and broadcasting
Digital media in sport (OTT platforms)
Social media management for sports

Sport for Good:
Ethical practices in sport
Sport and social impact
Sport for development initiatives

Identify Key Takeaways:
Thoroughly read the provided article content. Focus on understanding the central theme, key points, and any actionable advice or conclusions drawn by the author.
Core Message: Extract the main idea or thesis of the article that encapsulates the overall purpose or argument.
Essential Insights: Identify critical insights, observations, or findings that add value to the reader’s understanding of the topic.
Actionable Advice: Highlight any steps, recommendations, or practical advice that the reader can implement.
Supporting Data: Include any significant data, statistics, or examples that reinforce the article's points.
Concluding Remarks: Capture the final thoughts or reflections that tie the article together, providing closure or a call to action.
Output Format:

Return the extracted key takeaways in a bullet point list format, ensuring each takeaway is concise and impactful.
Limit the Takeaways:

Aim for at least 3-5 takeaways, each consisting of a single sentence or a brief statement. Focus on quality over quantity to maintain clarity and relevance.

Clean text: Please analyze the following text and remove all prepositions, articles, quotes, special caracters,conjunctions, words that are used only once and other common stop words (like "the," "and," "of," "in," etc.). Retain only the most meaningful and important words that convey the key information. The cleaned text should be suitable for generating a word cloud that highlights the primary topics and themes.


Write the Final Content in Italian:

Ensure the content is grammatically correct, easy to understand, and impactful.
Escape any quotes and special characters;Return the Final Content as a Valid JSON Object:


Example Output:

json
{
  "analisi_leggibilita": {
    "punteggio_flesch_kincaid": [0-100],   // Range from 0 (very difficult) to 100 (very easy)
    "tempo_di_lettura_minuti": [number],   // Estimated reading time in minutes
    "spiegazione": "[Dettagli sull'analisi della leggibilità e su come i punteggi sono stati determinati.]"
  },
  "rilevazione_di_pregiudizio": {
    "tipo_di_pregiudizio": [1-5],           // 1: Politico, 2: Culturale, 3: Economico, 4: Sociale, 5: Altro
    "grado_di_pregiudizio": [0-100],          // 0: Range from 0 (very low) to 100 (very high)
    "spiegazione": "[Dettagli sulla rilevazione del pregiudizio, con una spiegazione del tipo e del grado di pregiudizio identificato.]"
  },
    tags: [
    Sponsorship,
    Marketing,
    Esports...
    ], 
    takeaways: [
  "Key word or phrase 1",
  "Key word or phrase 2",
  "Key word or phrase 3"
  ],
  cleanText: "The text with only important and relevant words."
  "rilevazione_emozioni": {
    "emozioni": {
      "gioia": [0-100],                     // Percentuale di gioia (0-100)
      "tristezza": [0-100],                 // Percentuale di tristezza (0-100)
      "rabbia": [0-100],                    // Percentuale di rabbia (0-100)
      "paura": [0-100],                     // Percentuale di paura (0-100)
      "sorpresa": [0-100]                   // Percentuale di sorpresa (0-100)
    },
    "spiegazione": "[Dettagli sulla rilevazione delle emozioni e sulle percentuali associate a ciascuna emozione.]",
    }
  }
`

module.exports.sentimentAnalysisPrompt = sentimentAnalysisPrompt

const askAgentPrompt = (question) => `
Sei un esperto di sport, finanza sportiva e management sportivo.

Rispondi alla domanda dell’utente in modo chiaro, approfondito e professionale.  
La risposta deve essere ben argomentata, aggiornata e utile per chi lavora o studia nel mondo dello sport business.

Se possibile, cita le fonti e includi i link diretti agli articoli o ai documenti da cui provengono le informazioni.


🧠 Domanda dell’utente:
${question}

Rispondi in formato JSON nel seguente schema:
{
  "answer": "testo della risposta",
}
`

module.exports.askAgentPrompt = askAgentPrompt
