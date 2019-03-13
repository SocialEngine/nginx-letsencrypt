const fs = require('fs');
const path = require('path');
const {execute, log, handleError} = require('./util');
const {addDomain, getCerts} = require('./letsencrypt');

const cwd = process.cwd();
const nginxConf = path.join('/etc/nginx/conf.d/default.conf');
const nginxDefaultConf = fs.readFileSync(
    path.join(cwd, '/docker/nginx-default.conf'), 'utf-8'
);

async function updateConf () {
    const liveDir = path.join('/etc/letsencrypt/live');
    let template = nginxDefaultConf + '\n# Auto-generated \n\n';
    let certs = await getCerts();
    log('Updating nginx conf: ' + nginxConf);
    for (let domain of Object.keys(certs)) {
        const cert = path.join(liveDir, certs[domain], '/cert.pem');
        if (fs.existsSync(cert)) {
            template += await addDomain(certs[domain], domain);
            log(' -> ' + domain + '[' + certs[domain] + ']');
        }
    }

    fs.writeFileSync(nginxConf, template, 'utf-8');
    await reloadNginx().catch(handleError);

    return template;
}

async function reloadNginx () {
    const r = await execute('nginx -t');
    const reload = await execute('nginx -s reload');
    log(r, reload);
}

module.exports = {
    updateConf: updateConf
};
