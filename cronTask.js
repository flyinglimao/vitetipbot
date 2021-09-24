const { 
    getUnreceivedTransaction,
    receiveTransaction,
    sendTransaction,
} = require('./viteUtils')
const {
    findUserIdByName,
    getDirectMessage,
    getMentionedTweets,
} = require('./twitterApi')
const {
    user,
    transaction,
    tip,
    system,
} = require('./database');
const { handler: tweetHandler } = require('./tweetHandler');

function sleep (time) {
    return new Promise(res => setTimeout(res, time))
}

async function checkDeposits () {
    const unreceiveds = await getUnreceivedTransaction()
    console.debug('Unreceiveds: ' + JSON.stringify(unreceiveds.map(e => e.hash)))
    for (const unreceived of unreceiveds) {
        console.debug('Receiving: ' + JSON.stringify(unreceived.hash))
        const userId = await findUserIdByName(unreceived.memo.replace(/^@/, ''))

        if (!userId) {
            // no such user, simply receive and consider it as donation
            console.debug('No user can collect this tx, make it as a donation')
            await receiveTransaction(unreceived.hash).catch(() => null)
            console.debug('Received ' + unreceived.hash)
            tip.put({
                amount: unreceived.amount,
                from: '!blackhole',
                to: '!developer',
                status_id: 'offchain',
                timestamp: new Date().getTime()
            })
            const userRecord = await user.get(process.env.DONATE_TARGET)
            const userBalance = userRecord.count ? userRecord.items[0] : 0
            user.put(userBalance + unreceived.amount, process.env.DONATE_TARGET)
            await sleep(1000)
            continue
        }

        transaction.put({
            hash: unreceived.hash,
            status: 'PROCESSING',
            user_id: userId,
            balance: unreceived.amount,
            type: 'DEPOSIT',
            created_at: new Date().getTime()
        }, unreceived.hash)
        console.debug('Sending receiving transaction for ' + unreceived.hash)
        const receiveTx = receiveTransaction(unreceived.hash)
            .catch(err => err.error.code === -36011)
        const userRecord = await user.get(userId)
        const userBalance = userRecord ? userRecord.value : 0
        if (await receiveTx) {
            console.debug('Received ' + unreceived.hash)
            await Promise.all([
                user.put(userBalance + unreceived.amount, userId),
                transaction.update({
                    status: 'FINISHED',
                    updated_at: new Date().getTime()
                }, unreceived.hash),
                sleep(1000),
            ])
            console.debug(`Balance updated: from ${unreceived.hash} add ${unreceived.amount} to user ${userId}`)
        }
    }
}

/* This will recovery receives that haven't update balance */
async function recoveryDeposits () {
    const { items: processingReceives } = await transaction.fetch({
        status: 'PROCESSING',
        type: 'DEPOSIT',
    })
    console.debug('Unfinished: ' + JSON.stringify(processingReceives.map(e => e.hash)))
    for (const processingReceive of processingReceives) {
        console.debug('Recovering ' + processingReceive.hash)
        const { value: userBalance } = await user.get(processingReceive.user_id)
        await Promise.all([
            user.put(userBalance + processingReceive.balance, processingReceive.user_id),
            transaction.update({
                status: 'FINISHED',
                updated_at: new Date().getTime()
            }, processingReceive.hash),
            sleep(1000),
        ])
        console.debug(`Balance updated: from ${processingReceive.hash} add ${processingReceive.balance} to user ${processingReceive.user_id}`)
    }
}

/* Handle Tweet DM */
async function checkDM () {
    const { value: sinceId } = await system.get('DM_SINCE_ID') || { value: '0' }
    const dms = await getDirectMessage(sinceId)
    console.debug('DMs: ' + JSON.stringify(dms.map(e => e.id)))
    for (const dm of dms) {
        console.debug('Processing DM: ' + dm.id)

        await system.put(dm.id, 'DM_SINCE_ID')
    }
}

async function checkMentions () {
    const { value: sinceId } = await system.get('MENTIONED_SINCE_ID') || { value: '1' }
    const mentions = await getMentionedTweets(sinceId)
    console.debug('Mentions: ' + JSON.stringify(mentions.map(e => e.id)))
    for (const mention of mentions) {
        // mention handler
        console.debug('Processing status: ' + mention.id)
        await tweetHandler(mention)
        await system.put(mention.id, 'MENTIONED_SINCE_ID')
    }
}


;(async() => {
    await checkDeposits()
    await recoveryDeposits()
    await checkMentions()
})()