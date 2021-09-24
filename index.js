const { App } = require('deta')
const express = require('express')

const { cronTask } = require('./cronTask')

const app = App(express())

app.get('/', (req, res) => {
})

app.lib.cron(cronTask)
app.lib.run(cronTask)

module.exports = app