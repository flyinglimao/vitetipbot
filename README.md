Vite Tip Bot
============

The Vite Tip Bot allows users to send the $VITE cryptocurrency to users using only their Twitter handle.

DISCLAIMER
--
Please notes that this bot doesn't promise your coin won't be stolen or lost accidentally, use it at your own risk. Never use this bot to store your assets, not your keys, not your coins.

Usage
-----
You can find out more info on [Vite Tip Bot - Website](https://vitetipbot.deta.dev).

### DM Commands

These commands can only be execute with direct message, click command to open chat page.

* !help - Get a list of commands and hints of them
* !set_address <address> - Bind your Twitter account to an address. Once you get a tip, this bot will send it to your wallet directly
* !unset_address - Unbind your Twitter account from the given address. Once you get a tip, this bot will record it in the database
* !balance - Show your balance in the database
* !withdraw <address> <amount?> - Withdraw <amount> $VITE to <address>, withdraw all if amount isn't given
* !donate - Donate operator <amount> $VITE

### Tweet Commands

These commands can only be execute with Tweet, click command to open Tweet page. Don't forget to @ViteTipBot.

* tip <amount> @<user> - Tip @<user> <amount> $VITE
* donate <amount> - Donate operator <amount> $VITE


Deploy
------
This project is designed to be deployed on Deta.

### Deploy to Deta
[![Deploy](https://button.deta.dev/1/svg)](https://go.deta.dev/deploy?repo=https://github.com/flyinglimao/vitetipbot)

You will need to create a Twitter project, a Standalone App, and an account. You will also need to find user ids to set up environment parameters. If all done, the bot should work.

### Deploy to Other
To deploy on other cloud, there are some modification to be done.  

First, if you don't want to use [Deta](https://deta.sh), you will need to replace Deta Base with your database. You can bridge your database interface to methods of [Deta Base SDK](https://docs.deta.sh/docs/base/sdk) to avoiding deep code changes.  

Then. you will need to modify `index.js`. Unwrap the `deta.App` and remove `app.lib.run` and `app.lib.cron` to turn it into original Express.js app. You now should be able start server.  

Finally, you will need to execute `cronTask()` exported from `cronTask.js` periodly. The ideal duration is one minute to avoiding rate limits (DM api has a 15 calls / 15 mins limit). You can check out Twitter documents if you want to reduce the response time.
