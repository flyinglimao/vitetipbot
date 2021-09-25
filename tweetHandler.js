const {
    transaction,
    tip,
    user,
    address,
    system,
    spend,
    donate,
} = require('./database')
const {
    findUserIdByName,
    replyToTweet,
} = require('./twitterApi')
const {
    sendTransaction,
} = require('./viteUtils')

/*
 * Tweet Handler will parse mentioned tweet and execute related actions
 */
const actions = {}
actions.tip = async (text, tweet) => {
    const { groups } = text.match(/tip\s+\$?(?<amount>[0-9.]+)\s+@(?<target>[a-zA-Z0-9_]+)/) || {}
    const { amount: amountStr, target } = groups || {}
    const amount = parseFloat(amountStr || '')
    if (!amountStr || !target || !isFinite(amount)) {
        console.debug(`Invalid input ${text}`)
        const reply = await replyToTweet(tweet.id, 'Oops, I can\'t understand what you want me to do, check out commands on https://vitetipbot.limaois.me/.')
        console.debug('Reply: ' + reply)
        return
    }
    console.debug(`Sending ${amount} to ${target}`)
    const receiverId = await findUserIdByName(target)
    if (!receiverId) {
        console.debug(`Didn't find ${target}`)
        const reply = await replyToTweet(tweet.id, 'Oops, I didn\'t find @' + target)
        console.debug('Reply: ' + reply)
        return
    }

    const [
        sender,
        receiverAddress,
        receiver,
        tipCheck,
        ___,
    ] = await Promise.all([
        user.get(tweet.user_id),
        address.get(receiverId),
        user.get(receiverId),
        tip.fetch({ status_id: tweet.id }),
        spend.get(tweet.user_id)
            .then(record => {
                if (!record) spend.put(0, tweet.user_id)
            }),
    ])
    const senderBalance = sender ? sender.value : 0
    const receiverBalance = receiver ? receiver.value : 0
    console.debug(`Sender balance ${senderBalance}, Receiver address ${(receiverAddress || {}).value}, Receiver balance ${receiverBalance}, Tip check ${!tipCheck.count}`)

    // Recover
    if (tipCheck.count && !receiverAddress) {
        console.debug(`Tipped off-chain`)
        const reply = await replyToTweet(tweet.id, `You have successfully sent your ${amount} $VITE to @${target} via off-chain. Transaction key: ${tipCheck.items[0].key}`)
        console.debug('Reply: ' + reply)
        return
    } else if (tipCheck.count) {
        const tipRecord = tipCheck.items[0]
        if (tipRecord.hash === 'init') {
            console.debug(`Tipped but don't know if tx finished`)
            const reply = await replyToTweet(tweet.id, `You sent your ${amount} $VITE to @${target} but I don't know if @${target} received it. If no, please contact @billwu1999. Transaction key: ${tipRecord.key}`)
            console.debug('Reply: ' + reply)
            return
        } else {
            console.debug(`Tipped on-chain`)
            const reply = await replyToTweet(tweet.id, `You have successfully sent your ${amount} $VITE to @${target}. Transaction key: ${tipRecord.key}, Hash: ${tipRecord.hash}`)
            console.debug('Reply: ' + reply)
            return
        }
    }

    if (senderBalance < amount) {
        console.debug(`Balance insufficient`)
        const reply = await replyToTweet(tweet.id, 'Oops, you don\'t have enough $VITE to tip')
        console.debug('Reply: ' + reply)
        return
    }
    if (!receiverAddress) {
        console.debug(`Receiver didn't register to a address, tip off-chain`)
        const time = new Date().getTime()
        const [{key: tipKey}, _, __] = await Promise.all([
            tip.insert({
                amount,
                from: tweet.user_id,
                to: receiverId,
                status_id: tweet.id,
                hash: 'offchain',
                timestamp: time,
                from_screen_name: tweet.screen_name,
                to_screen_name: target,
            }, (1e13 - time) + '_' + tweet.user_id),
            user.put(senderBalance - amount, tweet.user_id),
            user.put(receiverBalance + amount, receiverId),
            system.update({ value: system.util.increment() }, 'NUMBER_OF_TIPS'),
            system.update({ value: system.util.increment(amount) }, 'TOTAL_TIPS'),
            spend.update({ value: spend.util.increment(amount) }, tweet.user_id),
        ])
        const reply = await replyToTweet(tweet.id, `You have successfully sent your ${amount} $VITE to @${target} via off-chain. Transaction key: ${tipKey}`)
        console.debug('Reply: ' + reply)
        return
    } else {
        console.debug(`Receiver registered to a address, tip on-chain`)
        user.put(senderBalance - amount, tweet.user_id)
        const time = new Date().getTime()
        const { key: tipKey } = await tip.insert({
            amount,
            from: tweet.user_id,
            to: receiverId,
            status_id: tweet.id,
            hash: 'init',
            timestamp: time,
            from_screen_name: tweet.screen_name,
            to_screen_name: target,
        }, (1e13 - time) + '_' + tweet.user_id)
        system.update({ value: system.util.increment() }, 'NUMBER_OF_TIPS')
        system.update({ value: system.util.increment(amount) }, 'TOTAL_TIPS')
        spend.update({ value: spend.util.increment(amount) }, tweet.user_id)
        console.debug(`Tip inserted: ${tipKey}`)
        // FIXME: recover send but not return tx
        const tx = await sendTransaction(receiverAddress.value, amount, 'ViteTipBot-' + tipKey + ' @' + tweet.screen_name)
        console.debug(`Transaction sent: ${tx.hash}`)
        transaction.put({
            hash: tx.hash,
            status: 'FINISHED',
            user_id: tweet.user_id,
            balance: -amount,
            type: 'TIP',
            created_at: new Date().getTime()
        }, tx.hash)
        tip.update({ hash: tx.hash }, tipKey)
        console.debug(`Tip updated: ${tipKey}`)
        const reply = await replyToTweet(tweet.id, `You have successfully sent your ${amount} $VITE to @${target}. Tip key: ${tipKey}, Tx hash: ${tx.hash}`)
        console.debug('Reply: ' + reply)
        return
    }
}
actions.donate = async (text, tweet) => {
    const { groups } = text.match(/donate\s+\$?(?<amount>[0-9.]+)/) || {}
    const { amount: amountStr } = groups || {}
    const amount = parseFloat(amountStr || '')
    if (!amountStr || !isFinite(amount)) {
        console.debug(`Invalid input ${text}`)
        const reply = await replyToTweet(tweet.id, 'It heard like you want to donate, thank you but I can\'t process it, check out commands on https://vitetipbot.limaois.me/.')
        console.debug('Reply: ' + reply)
        return
    }

    const [
        sender,
        target,
        tipCheck,
        ___,
    ] = await Promise.all([
        user.get(tweet.user_id),
        user.get(process.env.DONATE_TARGET),
        tip.fetch({ status_id: tweet.id }),
        donate.get(process.env.DONATE_TARGET)
            .then(record => {
                if (!record) donate.put(0, tweet.user_id)
            }),
    ])
    const senderBalance = sender ? sender.value : 0
    const targetBalance = target ? target.value : 0

    if (tipCheck.count) {
        console.debug(`Tipped off-chain`)
        const reply = await replyToTweet(tweet.id, `Thank you for donating! You have successfully donate your ${amount} $VITE to @billwu1999. Tip key: ${tipCheck.items[0].key}`)
        console.debug('Reply: ' + reply)
        return
    }

    if (senderBalance - amount < 0) {
        console.debug(`Balance insufficient`)
        const reply = await replyToTweet(tweet.id, 'Thank you for donating! But you don\'t have enough $VITE 🥲')
        console.debug('Reply: ' + reply)
        return
    }
    console.debug(`Donate off-chain`)
    const time = new Date().getTime()
    const [{key: tipKey}, _, __] = await Promise.all([
        tip.insert({
            amount,
            from: tweet.user_id,
            to: '!developer',
            status_id: tweet.id,
            hash: 'offchain',
            timestamp: time,
        }, (1e13 - time) + '_' + tweet.user_id),
        user.put(senderBalance - amount, tweet.user_id),
        user.put(targetBalance + amount, process.env.DONATE_TARGET),
        system.update({ value: system.util.increment() }, 'NUMBER_OF_TIPS'),
        system.update({ value: system.util.increment(amount) }, 'TOTAL_TIPS'),
        donate.update({ value: donate.util.increment(amount) }, tweet.user_id),
    ])
    const reply = await replyToTweet(tweet.id, `Thank you for donating! You have successfully donate your ${amount} $VITE to @billwu1999. Tip key: ${tipKey}`)
    console.debug('Reply: ' + reply)
}

function handler (tweet) {
    const actionKeys = Object.keys(actions)
    const regex = tweet.text.match(RegExp(`(${actionKeys.join('|')})( .*)?$`))
    return actions[regex[1]](regex[0], tweet)
}

module.exports = {
    handler,
}
