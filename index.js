require('./setup')

const path = require('path')
const axios = require('axios')
const { system, tip, spend, donate } = require('./database')
const { getNamesByUserIds } = require('./twitterApi')

const { App } = require('deta')
const express = require('express')

const { cronTask } = require('./cronTask')

const app = App(express())
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'))

let usdPrice

app.get('/', async (req, res) => {
  return Promise.all([
    system.get('TOTAL_TIPS'),
    system.get('NUMBER_OF_TIPS'),
  ]).then((ary) => {
    const [{ value: tipped }, { value: numberOfTips }] = ary
    if (usdPrice) {
      return res.render('index', {
        tipped,
        numberOfTips,
        value: tipped * usdPrice,
      })
    }

    axios.get('https://api.coingecko.com/api/v3/simple/price?ids=vite&vs_currencies=usd')
      .then((response) => {
        usdPrice = response.data.vite.usd
        res.render('index', {
          tipped,
          numberOfTips,
          value: tipped * usdPrice,
        })
      })
  })
})

app.get('/recent', async (req, res) => {
  tip.fetch({
    'to?not_contains': '!',
  }, { limit: 20 })
    .then(({ items: tips }) => {
      res.render('recent', { tips })
    })
})

const spendTopsCache = {}
async function getSpendTops (top = 50) {
  if (new Date() - spendTopsCache.time < 600000 && spendTopsCache.data) return spendTopsCache.data

  let spendTops = []
  let query = await spend.fetch({}, { limit: 200 })
  spendTops.push(...query.items)
  spendTops.sort((a, b) => b.value - a.value)
  spendTops = spendTops.slice(0, top)
  while (query.last) {
    const min = Math.min(spendTops.map((e) => e.value))
    query = await spend.fetch({
      'value?gt': min,
    }, { limit: 200, last: query.last })
    spendTops.push(...query.items)
    spendTops.sort((a, b) => b.value - a.value)
    spendTops = spendTops.slice(0, top)
  }
  spendTopsCache.data = spendTops
  spendTopsCache.time = (new Date()).getTime()
  return spendTops
}
const donateTopsCache = {}
async function getDonateTops (top = 50) {
  if (new Date() - donateTopsCache.time < 600000 && donateTopsCache.data) return donateTopsCache.data
  let donateTops = []
  let query = await donate.fetch({}, { limit: 200 })
  donateTops.push(...query.items)
  donateTops.sort((a, b) => b.value - a.value)
  donateTops = donateTops.slice(0, top)
  while (query.last) {
    const min = Math.min(donateTops.map((e) => e.value))
    query = await donate.fetch({
      'value?gt': min,
    }, { limit: 200, last: query.last })
    donateTops.push(...query.items)
    donateTops.sort((a, b) => b.value - a.value)
    donateTops = donateTops.slice(0, top)
  }
  donateTopsCache.data = donateTops
  donateTopsCache.time = (new Date()).getTime()
  return donateTops
}
app.get('/tops', async (req, res) => {
  const [spendTops, donateTops] = await Promise.all([
    getSpendTops(),
    getDonateTops(),
  ])
  const usernames = await getNamesByUserIds([...spendTops.map((e) => e.key), ...donateTops.map((e) => e.key)])
  res.render('tops', { spendTops, donateTops, usernames })
})
app.get('/explorer', async (req, res) => {
  let {
    last,
    tip: tipKey,
    user,
  } = req.query
  if (typeof last !== 'string') last = undefined
  if (typeof tipKey !== 'string') tipKey = undefined
  if (typeof user !== 'string') user = undefined

  const tips = tipKey
    ? { items: [await tip.get(tipKey)] }
    : await tip.fetch(
      user && user.length
        ? [
            { from: user },
            { from_screen_name: user.replace('@', '') },
            { to: user },
            { to_screen_name: user.replace('@', '') },
          ]
        : {}
      , { limit: 50, last })

  if (req.accepts('html')) {
    res.render('explorer', { tips })
  } else {
    res.json(tips)
  }
})

app.lib.cron(cronTask)
app.lib.run(cronTask)

module.exports = app

app.listen(8080)
