const {runJob} = require('./job');
const {handleError, handleCatch, log} = require('./util');
const nginx = require('./nginx');
const redis = require('./redis');
const auth = require('./auth');

function end (type = 0) {
    process.exit(type);
}

async function main (cmd) {
    switch (cmd) {
        case 'job':
            const id = process.argv[3] || '';
            if (id) {
                await runJob(id).catch(handleCatch);
            }
            break;
        case 'update':
            await nginx.update().catch(handleCatch);
            break;
        case 'token':
            console.log(await auth.generate());
            break;
        case 'ping':
            log('Ping servers...');
            redis.publisher.publish(redis.channel, 'ping');
            break;
        case 'nginx:init':
            await nginx.init();
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
