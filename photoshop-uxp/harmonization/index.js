const photoshop = require('photoshop')

async function actionCommands () {
  const commands = [
    {
      _obj: 'hide',
      null: [
        {
          _name: 'Backgrounds',
          _ref: 'layer'
        }
      ]
    }
  ]

  return photoshop.action.batchPlay(commands, {})
}

module.exports = {
  async main () {
    return photoshop.core.executeAsModal(actionCommands, {
      commandName: 'Action Commands'
    })
  }
}
