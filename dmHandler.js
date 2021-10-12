const {
  transaction,
  tip,
  user,
  address: addressDB,
  donate,
  system,
  antispam,
} = require('./database')
const {
  sendDirectMessage, getNamesByUserIds,
} = require('./twitterApi')
const {
  sendTransaction,
  address: botAddress,
} = require('./viteUtils')
const { wallet: { isValidAddress } } = require('@vite/vitejs')

/*
 * DM Handler will parse direct message and execute related actions
 */
const actions = {}
actions.help = async (text, dm) => {
  sendDirectMessage(dm.sender_id, `\
Thank you for using the @ViteTipBot!

DISCALIMER: @ViteTipBot don't promise your coin won't be stolen or lost accidentally, use it at your own risk.

To start tipping, you will need to send $VITE to ${botAddress} with your Twitter username as memo.
Or if you were tipped and haven't register a Vite address, you can create your wallet and use !withdraw command.

There are some DM commands:
!help : show this help
!set_address <address> : setup your address, tips will send to your address directly after setup
!unset_address : unset your address, tips will be recorded in my brain
!balance : get your balance
!withdraw <address> <amount?> : withdraw <amount> $VITE from pool, withdraw all if amount isn't determine
!donate <amount> : donate to operator of the bot

There are Tweet commands:
tip <amount> @<user> : tip <amount> $VITE to <user>
donate <amount> : donate <amount> to operator`)
}
actions.set_address = async (text, dm) => {
  const { groups } = text.match(/!set_address\s+(?<address>\S+)/) || {}
  const { address } = groups || {}
  if (!isValidAddress(address)) {
    console.debug('Invalid input ' + text)
    sendDirectMessage(dm.sender_id, 'Address invalid, please check again')
    return
  }
  await addressDB.put(address, dm.sender_id)
  sendDirectMessage(dm.sender_id, `Address updated, now tips will send to ${address} directly`)
}
actions.unset_address = async (text, dm) => {
  await addressDB.delete(dm.sender_id)
  sendDirectMessage(dm.sender_id, 'Address deleted, now tips will be recorded in my brain (database)')
}
actions.balance = async (text, dm) => {
  const balance = (await user.get(dm.sender_id) || {}).value || 0
  sendDirectMessage(dm.sender_id, `Your balance: ${balance}`)
  if (balance > 10000) sendDirectMessage(dm.sender_id, 'You might have too many $VITE here, remember that "Not your keys, not your coins"')
}
actions.withdraw = async (text, dm) => {
  const { groups } = text.match(/!withdraw\s+(?<address>\S+)(\s+(?<amount>[0-9.]+))?$/) || {}
  const { address, amount: amountStr } = groups || {}
  if (!isValidAddress(address) || (amountStr && amountStr.length && !isFinite(amountStr))) {
    console.debug('Invalid input ' + text)
    sendDirectMessage(dm.sender_id, 'Address or amount invalid , please check again')
    return
  }

  const balance = (await user.get(dm.sender_id) || {}).value || 0
  let amount = balance
  if (amountStr && amountStr.length) {
    amount = parseFloat(amountStr)
    if (balance < amount) {
      console.debug('Balance insufficient')
      sendDirectMessage(dm.sender_id, `Oops, you don't have enough $VITE. Your balance: ${balance}`)
      return
    }
    if (amount === 0) {
      console.debug('Withdraw 0')
      sendDirectMessage(dm.sender_id, `You have successfully withdraw 0 $VITE to ${address}, but it doens't need a transaction 😅`)
      return
    }
  }
  if (amount === 0) {
    console.debug('Withdraw 0')
    sendDirectMessage(dm.sender_id, `Oops, you don't have enough $VITE. Your balance: ${balance}`)
    return
  }
  console.debug(`Start withdraw ${amount} to ${address}`)
  user.put(balance - amount, dm.sender_id)
  const tx = await sendTransaction(address, amount, 'ViteTipBot withdraw')
  console.debug(`Transaction sent: ${tx.hash}`)
  transaction.put({
    hash: tx.hash,
    status: 'FINISHED',
    user_id: dm.sender_id,
    balance: -amount,
    type: 'WITHDRAW',
    created_at: new Date().getTime(),
  }, tx.hash)
  sendDirectMessage(dm.sender_id, `You have successfully withdraw ${amount} $VITE to ${address}. Transaction hash: ${tx.hash}`)
}
actions.donate = async (text, dm) => {
  const { groups } = text.match(/!donate\s+\$?(?<amount>[0-9.]+)$/) || {}
  const { amount: amountStr } = groups || {}
  const amount = parseFloat(amountStr || '')
  if (!amountStr || !isFinite(amount)) {
    console.debug(`Invalid input ${text}`)
    sendDirectMessage(dm.sender_id, 'It heard like you want to donate, thank you but I can\'t process it, check out commands on https://vitetipbot.limaois.me/.')
    return
  }

  const [
    sender,
    target,
    ___,
  ] = await Promise.all([
    user.get(dm.sender_id),
    user.get(process.env.DONATE_TARGET),
    donate.get(process.env.DONATE_TARGET)
      .then((record) => {
        if (!record) donate.put(0, dm.sender_id)
      }),
  ])
  const senderBalance = sender ? sender.value : 0
  const targetBalance = target ? target.value : 0

  if (senderBalance < amount) {
    console.debug('Balance insufficient')
    sendDirectMessage(dm.sender_id, 'Thank you for donating! But you don\'t have enough $VITE 🥲')
    return
  }
  console.debug('Donate off-chain')
  const time = new Date().getTime()
  const [{ key: tipKey }, _, __] = await Promise.all([
    tip.insert({
      amount,
      from: dm.sender_id,
      from_screen_name: '',
      to: '!developer',
      status_id: 'NOT_STATUS: dm donate',
      hash: 'offchain',
      timestamp: time,
    }, (1e13 - time) + '_' + dm.sender_id),
    user.put(senderBalance - amount, dm.sender_id),
    user.put(targetBalance + amount, process.env.DONATE_TARGET),
    system.update({ value: system.util.increment() }, 'NUMBER_OF_TIPS'),
    system.update({ value: system.util.increment(amount) }, 'TOTAL_TIPS'),
    donate.update({ value: donate.util.increment(amount) }, dm.sender_id),
  ])
  getNamesByUserIds([dm.sender_id]).then((map) => {
    tip.update({ from_screen_name: map[dm.sender_id] }, (1e13 - time) + '_' + dm.sender_id)
  })
  sendDirectMessage(dm.sender_id, `Thank you for donating! You have successfully donate your ${amount} $VITE to @${process.env.DONATE_TARGET_HANDLE}. Tip key: ${tipKey}`)
}

async function handler (dm) {
  // antispam
  const now = new Date().getTime()
  const antispamUser = await antispam.get(dm.sender_id) || { counter: 0, timestamp: now }
  if (antispamUser.counter >= 10 && now - antispamUser.timestamp < 3600000) {
    // Block user who send too many dm
    if (antispamUser.counter === 10) {
      antispamUser.counter++
      antispam.put(antispamUser, dm.sender_id)
      return sendDirectMessage(
        dm.sender_id,
        'In order not to be marked as spam, I cannot response too many message. Come back after an hour.',
      )
    }
    return
  } else {
    antispamUser.counter++
    antispamUser.timestamp = new Date().getTime()
    antispam.put(antispamUser, dm.sender_id)
  }

  const actionKeys = Object.keys(actions)
  const regex = dm.text.match(RegExp(`^\\!(${actionKeys.join('|')})( .*)?$`))
  if (!regex) {
    console.debug(dm.text)
    return sendDirectMessage(
      dm.sender_id,
      dm.text.startsWith('!')
        ? 'Sorry, I don\'t understand your message, be sure to type in lowercase, or you can !help to check out help'
        : 'Hi, if you want to execute an command, be sure to start command with ! and type in lowercase. If you\'re looking for helps, please DM @billwu1999 or go our Discord https://discord.gg/xJaVNjpt9f'
    )
  }
  return actions[regex[1]](regex[0], dm)
}

module.exports = {
  handler,
}
