var Jimp = require("jimp")
const articles = require("./db.json")

async function main() {
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK)

  for (let i = 0; i < articles.calciofinanza.length; i++) {
    const image = await Jimp.read("./template.jpeg")
    const text = articles.calciofinanza[i].copy[0].content
    let test = image.print(font, 100, 100, text)
    test.writeAsync(`./test${i}.jpeg`)
  }
}

main()
