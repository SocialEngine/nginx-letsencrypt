const {publisher, key} = require('./redis');
const {certbot} = require('./letsencrypt');
const {log, handleCatch} = require('./util');
const {updateConf} = require('./nginx');

async function createJob (data) {
    const id = new Date().getTime();
    const job = {
        id: id,
        ...data
    };
    await publisher.sAdd(key('jobs'), id);
    await publisher.set(key('jobs:' + id), JSON.stringify(job));
    return id;
}

async function getJob (id) {
    let job = await publisher.get(key('jobs:' + id));
    if (!job) {
        return false;
    }
    return JSON.parse(job);
}

async function clearJob (id) {
    await publisher.sRem(key('jobs'), id);
    await publisher.del(key('jobs:' + id));
}

async function runJob (id) {
    const response = await new Promise(async function (resolve) {
        log('Run job: ' + id);
        const job = await getJob(id);
        if (!job) {
            log('Not a valid job: ' + id);
            return resolve(false);
        }
        const tryCert = async function tryAgain () {
            return certbot(job)
                .then(() => resolve(true))
                .catch(async e => {
                    if (e.message === 'DOMAIN_DNS_FAILED') {
                        log('DNS failed, waiting...');
                        setTimeout(async () => {
                            log('trying again...');
                            await tryAgain();
                        }, 60000);
                    } else {
                        log('completed!');
                        resolve(true);
                    }
                });
        };
        await tryCert();
    });
    await clearJob(id);
    if (response) {
        await updateConf().catch(handleCatch);
    }
    log('Job completed: ' + id);
    return true;
}

module.exports = {
    runJob: runJob,
    createJob: createJob
};
