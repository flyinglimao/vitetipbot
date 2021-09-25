require('dotenv').config()

const { Deta } = require('deta')
const deta = Deta(process.env.DETA_PROJECT_KEY)

/*
 * User
 *     Key: user_id
 *   Value: balance
 */
const user = deta.Base(process.env.DETA_BASE_PREFIX + 'User')

/*
 * Spend
 *     Key: user_id
 *   Value: spend_amount
 */
const spend = deta.Base(process.env.DETA_BASE_PREFIX + 'Spend')

/*
 * Donate
 *     Key: user_id
 *   Value: spend_amount
 */
const donate = deta.Base(process.env.DETA_BASE_PREFIX + 'Donate')

/*
 * Address
 *     Key: user_id
 *   Value: address
 */
const address = deta.Base(process.env.DETA_BASE_PREFIX + 'Address')

/*
 * Transaction
 *   Object: hash, status, user_id, balance, type
 *     status: PROCESSING or FINISHED
 *     type: DEPOSIT, WITHDRAW
 *   
 *   A deposit transaction will be processing after sent receive account block
 *   and be finished after balance updated.
 * 
 *   A withdraw transaction will be always finished.
 */
const transaction = deta.Base(process.env.DETA_BASE_PREFIX + 'Transaction')

/*
 * Tip
 *   Column: amount, from, to, status_id, timestamp
 *     from, to: user id
 */
const tip = deta.Base(process.env.DETA_BASE_PREFIX + 'Tip')

/*
 * System: system state like sinceIds for twitter api
 */
const system = deta.Base(process.env.DETA_BASE_PREFIX + 'System')

module.exports = {
    user,
    address,
    transaction,
    tip,
    system,
    spend,
    donate,
}