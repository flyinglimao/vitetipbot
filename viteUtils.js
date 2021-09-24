require('dotenv').config()

const { ViteAPI, accountBlock, wallet } = require('@vite/vitejs')
const { HTTP_RPC } = require('@vite/vitejs-http')
const BigNumber = require('@ethersproject/bignumber')

const httpProvider = new HTTP_RPC(process.env.HTTP_RPC)
const api = new ViteAPI(httpProvider, () => console.log('Connected to ' + process.env.HTTP_RPC))

const account = wallet.getWallet(process.env.MNEMONIC).deriveAddress(process.env.ACCOUNT_INDEX)

console.log('Inited with account ' + account.address)

async function getUnreceivedTransaction () {
    const transactions = await api.request('ledger_getUnreceivedBlocksByAddress', account.address, 0, 100)
    transactions.reverse() // make the oldest tx on the top
    return transactions.map(tx => {
        if (tx.tokenId !== 'tti_5649544520544f4b454e6e40') return {
            memo: '',
            amount: 0,
            hash: tx.hash
        }
        else return {
            memo: Buffer.from(tx.data, 'base64').toString(),
            amount: parseFloat(BigNumber.formatFixed(tx.amount, 18)),
            hash: tx.hash,
        }
    })
}
async function receiveTransaction (hash) {
    const block = accountBlock.createAccountBlock('receive', {
        address: account.address,
        sendBlockHash: hash,
    })
    await block.setProvider(api).setPrivateKey(account.privateKey)
    await block.autoSetPreviousAccountBlock()
    await block.autoSendByPoW()
    return true
}
async function sendTransaction (toAddress, amount, memo) {
    const data = memo ? Buffer.from(memo).toString('base64') : ''
    const block = accountBlock.createAccountBlock('send', {
        address: account.address,
        toAddress,
        tokenId: 'tti_5649544520544f4b454e6e40',
        amount: BigNumber.parseFixed(amount.toString(), 18).toString(),
        data
    })
    await block.setProvider(api).setPrivateKey(account.privateKey)
    await block.autoSetPreviousAccountBlock()
    await block.autoSendByPoW()
    return true
}

module.exports = {
    getUnreceivedTransaction,
    receiveTransaction,
    sendTransaction,
}