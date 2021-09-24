const axios = require('axios')
const { system, tip } = require('./database')

const { App } = require('deta')
const express = require('express')

const { cronTask } = require('./cronTask')

const app = App(express())
app.set('view engine', 'ejs')
app.set('views', __dirname + '/views');

let usdPrice

app.get('/', async (req, res) => {
    return Promise.all([
        system.get('TOTAL_TIPS'),
        system.get('NUMBER_OF_TIPS'),
    ]).then(ary => {
        const [{ value: tipped }, { value: numberOfTips }] = ary
        if (usdPrice) return res.render('index', {
            tipped,
            numberOfTips,
            value: 87000 * usdPrice
        })
    
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=vite&vs_currencies=usd')
            .then(response => {
                usdPrice = response.data.vite.usd
                res.render('index', {
                    tipped,
                    numberOfTips,
                    value: tipped * usdPrice
                })
            })
    })
})

app.get('/recent', async (req, res) => {
    tip.fetch({
        'to?not_contains': '!'
    }, { limit: 20 })
        .then(({ items: tips }) => {
            res.render('recent', { tips })
        })
})

app.lib.cron(cronTask)
app.lib.run(cronTask)

module.exports = app

app.listen(8080)