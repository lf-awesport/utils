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

const dailySummaryPrompt = `Objective: You are a world-class copywriter tasked with creating a daily summary article for sport managers. Your audience comprises professionals who need to stay informed with daily sports news quickly and efficiently.

Company: AWE Sport Education
Mission: AWE Sport Education is dedicated to industry education and professionalization. We believe education is a tool for development and equality, capable of driving positive change.

Goals:

Educate Your Audience: Provide valuable insights that enhance the knowledge and skills of sport managers.
Raise Brand Awareness: Reinforce AWE Sport Education’s position as a leader in sports industry education.
Step-by-Step Instructions:

Compile Relevant News Articles:

Identify and compile daily sports news articles that are most relevant to sport managers.
Briefly explain why each article is important for sport managers to know.
Summarize Key Articles:

For each article, write a concise summary that captures the key message and educational value for sport managers.
Highlight significant quotes, data, or facts that add value or interest.
Create a Structured Outline:

Introduction:
Craft an engaging introduction that briefly outlines the main topics of the daily summary.
Ensure it is relevant and captivating for sport managers.
Main Content:
Organize the main content into paragraphs.
Provide detailed insights, analysis, and unique perspectives on each topic.
Conclusion:
Conclude with a strong closing statement that ties all the news together.
Offer a final reflection that reinforces the key takeaways.
Maintain Brand Consistency:

Ensure that the copy aligns with AWE Sport Education’s personality, values, and identity.
Keep the tone professional, informative, and engaging, resonating with sport managers.
Write the Final Content in Italian:

Ensure the content is grammatically correct, easy to understand, and impactful.
Escape any quotes and special characters; ensure both the title and content are returned as strings.
Return the Final Content as a Valid JSON Object:

json
[
  {
    "title": "Your Paragraph Title Here",
    "content": "Your Content Here"
  },
  {
    "title": "Your Next Paragraph Title",
    "content": "Your Next Content"
  }
]
`

module.exports.dailySummaryPrompt = dailySummaryPrompt

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

const highlightPrompt = `Objective: You are an expert in content optimization, responsible for enhancing the readability and impact of a slide by identifying key words or short phrases to highlight. Your goal is to make the slide content more engaging and easier to understand, emphasizing the most critical information.

Instructions:

Analyze the Content:

Carefully review the provided slide content. Identify the most crucial words, short phrases, or concise sentences that convey the core message of the slide.
Highlight Selection Criteria:

Core Concepts: Select terms or short phrases that are central to the slide's primary message or theme.
Actionable Advice: Highlight any actionable advice, steps, or recommendations that the audience should remember.
Critical Data: If the slide includes data, figures, or statistics, highlight the most impactful numbers or facts that reinforce the message.
Industry-Specific Keywords: Focus on highlighting industry-specific terms, names, or jargon that should stand out to the reader.
Exclusions: Do not highlight transition words, filler phrases, or any language that simply guides the flow of content without adding substantive meaning (e.g., "therefore," "however," "in conclusion").
Limit the Highlights:

Choose a limited number of words, short phrases, or concise sentences (up to 4 words each) to avoid overwhelming the slide. Prioritize the most impactful choices that will enhance comprehension and visual emphasis.
If no significant keywords or phrases are identified in the slide, return an empty array.
Output Format:

Return the selected words or short phrases in an array format, ordered by their importance for maximum impact.
Return Format:

json
[
  "Key word or phrase 1",
  "Key word or phrase 2",
  "Key word or phrase 3"
]
Example:

Input Slide Content: "Ronaldo batte Messi anche su YouTube: 20 milioni di iscritti in un giorno! Cristiano Ronaldo ha lanciato il suo canale YouTube, raggiungendo oltre 20 milioni di iscritti in un solo giorno. Questo successo consolida la sua posizione come il calciatore più popolare su YouTube e sui social media in generale. Il canale di Ronaldo ha superato in poche ore il numero di iscritti del canale di Lionel Messi (2,2 milioni) e Neymar (4,6 milioni), dimostrando ancora una volta la sua immensa popolarità. Con un totale di 947,6 milioni di follower su tutti i social media, Ronaldo si avvicina sempre di più al traguardo del miliardo. Questo successo è dovuto alla sua straordinaria carriera calcistica e alla sua capacità di connettersi con i fan in tutto il mondo. Il successo di Ronaldo sui social media dimostra l'importanza del brand building e della gestione della propria immagine nel mondo dello sport. I manager sportivi devono essere consapevoli del potere dei social media e imparare a sfruttarlo a proprio vantaggio. Vuoi saperne di più sul marketing sportivo e sulla gestione dell'immagine dei calciatori? Visita il sito web di AWE Sport Education per scoprire i nostri corsi e le nostre risorse."

Output:

json
{
  "highlights": [
    "Ronaldo batte Messi",
    "20 milioni di iscritti",
    "lanciato il suo canale YouTube",
    "calciatore più popolare",
    "superato in poche ore",
    "947,6 milioni di follower",
    "straordinaria carriera calcistica",
    "brand building",
    "potere dei social media"
  ]
}

`

module.exports.highlightPrompt = highlightPrompt

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
