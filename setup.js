const { system } = require('./database')

;(async () => {
    Promise.all([
        system.get('TOTAL_TIPS'),
        system.get('NUMBER_OF_TIPS'),
    ]).then(ary => {
        if (!ary[0]) system.put(0, 'TOTAL_TIPS')
        if (!ary[1]) system.put(0, 'NUMBER_OF_TIPS')
    })
})()