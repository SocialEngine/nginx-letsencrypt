const {runJob} = require('./job');
const {handleError, handleCatch, log} = require('./util');
const {updateConf} = require('./nginx');
const auth = require('./auth');

function end (type = 0) {
    process.exit(type);
}

async function main (cmd) {
    log('Console cmd: ' + cmd);
    switch (cmd) {
        case 'job':
            const id = process.argv[3] || '';
            if (id) {
                await runJob(id).catch(handleCatch);
            }
            break;
        case 'update':
            await updateConf().catch(handleCatch);
            break;
        case 'token':
            console.log(await auth.generate());
            break;
    }
}

try {
    main(process.argv[2] || '')
        .then(end)
        .catch(e => {
            handleError(e);
            end(1);
        });
} catch (e) {
    handleError(e);
    end(1);
}
