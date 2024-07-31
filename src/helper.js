const data = require("./db.json")
const { text2Speech } = require("./speech")

const run = async () => {
  for (let i = 0; i < data.calciofinanza.length; i++) {
    for (let j = 0; j < data.calciofinanza[i].videoCopy.length; j++) {
      const label = data.calciofinanza[i].id + "section " + (j + 1)
      const text = data.calciofinanza[i].videoCopy[j].vo
      await text2Speech(text, label)
    }
  }
}

run()
