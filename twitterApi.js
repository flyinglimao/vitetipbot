require('dotenv').config()

const Twit = require('twit')
const twitter = new Twit({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_SECRET,
})

async function getMentionedTweets (sinceId = '1') {
  const data = await new Promise((resolve, reject) => {
    twitter.get('statuses/mentions_timeline', {
      since_id: sinceId,
      count: 200,
    }, function (err, data) {
      if (err) return reject(err)
      resolve(data)
    })
  })
  return data.reverse().map((tweet) => ({
    id: tweet.id_str,
    text: tweet.text,
    user_id: tweet.user.id_str,
    screen_name: tweet.user.screen_name,
  }))
}
async function replyToTweet (tweetId, text) {
  return new Promise((resolve, reject) => {
    twitter.post('statuses/update', {
      status: text,
      in_reply_to_status_id: tweetId,
      auto_populate_reply_metadata: true,
    }, function (err, data) {
      if (err) return reject(err)
      resolve(data.id_str)
    })
  })
}
async function _getDirectMessage (cursor) {
  return new Promise((resolve, reject) => {
    twitter.get('direct_messages/events/list',
      cursor
        ? { cursor, count: 50 }
        : { count: 50 }
      , function (err, data) {
        if (err) return reject(err)
        resolve(data)
      })
  })
}
// string number compare
function largerThan (a, b) {
  if (a.length > b.length) return true
  if (a.length < b.length) return false
  return a > b
}
async function getDirectMessage (sinceId = '0') {
  let res = await _getDirectMessage()
  let data = res.events
  if (!data || data.length === 0) return []
  while (largerThan(data.slice(-1)[0].id, sinceId) && res.next_cursor) {
    res = await _getDirectMessage(res.next_cursor)
    data = data.concat(res.events)
  }
  return data
    .filter((event) => event.type === 'message_create' &&
            event.message_create &&
            event.message_create.target.recipient_id === process.env.TWITTER_USER_ID &&
            largerThan(event.id, sinceId),
    ).map((event) => ({
      id: event.id,
      text: (event.message_create || { message_data: {} }).message_data.text,
      sender_id: (event.message_create || {}).sender_id,
    })).reverse()
}
async function sendDirectMessage (target, text) {
  return new Promise((resolve) => {
    twitter.post('direct_messages/events/new', {
      event: {
        type: 'message_create',
        message_create: {
          target: {
            recipient_id: target,
          },
          message_data: {
            text,
          },
        },
      },
    }, function (err, data) {
      if (err) console.error(err)
      if (data) return resolve(data)
      resolve('none')
    })
  })
}
async function findUserIdByName (name) {
  return new Promise((resolve, reject) => {
    twitter.get('users/lookup', {
      screen_name: name,
    }, function (err, data) {
      if (Array.isArray(data)) {
        const account = data[0]
        if (account.id_str) return resolve(account.id_str)
        else return reject(new Error('unknown error'))
      }
      if (data.errors && data.errors[0].code === 17) resolve('')
      else reject(err)
    })
  })
}
const userNameCache = {}
async function getNamesByUserIds (userIds) {
  const userIdsToFetch = []
  const idNameMap = {}
  userIds.forEach((id) => {
    idNameMap[id] = userNameCache[id]
    if (!userNameCache[id]) userIdsToFetch.push(id)
  })
  return new Promise((resolve, reject) => {
    if (!userIdsToFetch.length) return resolve(idNameMap)

    twitter.get('users/lookup', {
      user_id: userIdsToFetch.join(','),
    }, function (err, data) {
      if (err) {
        reject(err)
      }
      data.forEach((user) => {
        idNameMap[user.id_str] = user.screen_name
        userNameCache[user.id_str] = user.screen_name
      })
      resolve(idNameMap)
    })
  })
}

module.exports = {
  getMentionedTweets,
  replyToTweet,
  getDirectMessage,
  findUserIdByName,
  sendDirectMessage,
  getNamesByUserIds,
}
