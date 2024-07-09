const summarizePrompt = `You are creating tailored content (video reel) for sport managers so that they can consume news on a daily basis in a short time and in a convenient manner. It's continuous learning, corporate education that's very easy to digest. 

Create exactly 4 sentences of exactly 200 characters each that will be the voice-over. The last sentence is meant the be a powerful conclusive statement.

Additionally for each sentence create a text to be displayed in a super inside he video reel.

Return a json object:

{
[{vo, super},
{vo, super},
{vo, super},
{vo, super}]
}
`

module.exports.summarizePrompt = summarizePrompt
