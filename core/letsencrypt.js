const exec = require('child_process').execSync;
const fetch = require('node-fetch');
const {env, execute, handleCatch, log} = require('./util');
const redis = require('./redis');
const fs = require('fs');
const path = require('path');

async function getCertParent (domain) {
    return redis.publisher.get('certs:' + domain);
}

async function checkDomain (domain) {
    const request = await fetch('http://' + domain + '/heartbeat').catch(handleCatch);
    if (!request) {
        return false;
    }
    const data = await request.json().catch(handleCatch);
    if (!data) {
        return false;
    }
    return data.success !== undefined;
}

exports.getCert = async function (domain) {
    const parentCert = await getCertParent(domain);
    if (!parentCert) {
        return false;
    }
    return {
        parent: parentCert
    };
};

exports.getCerts = async function () {
    const certs = {};
    const members = await redis.publisher.sMembers('certs');
    log('members:', members);
    for (let member of members) {
        certs[member] = await getCertParent(member);
    }
    return certs;
};

exports.certbot = async function ({email, domain, force = false}) {
    const checkDomains = domain.split(',').map(i => i.trim());
    const activeCerts = await this.getCerts();
    log('activeCerts', activeCerts);
    if (activeCerts[checkDomains[0]] !== undefined && force === false) {
        throw new Error('DOMAIN_ALREADY_EXISTS');
    }
    let domains = '';
    let success = [];
    let fail = [];
    log('checkDomains', checkDomains);
    for (let item of checkDomains) {
        const req = await checkDomain(item);
        if (!req) {
            fail.push(item);
            continue;
        }
        success.push(item);
        domains += ' -d ' + item;
    }

    if (fail.length) {
        throw new Error('DOMAIN_DNS_FAILED');
    }

    // console.log(domains);
    const cmd = '/app/certbot-auto certonly -t --agree-tos ' +
        '-m ' + email + ' -n ' +
        '--expand ' +
        (force === false ? '' : '--force-renewal ') +
        '--webroot -w /usr/share/nginx/html ' +
        domains;

    const response = await execute(cmd);
    log('certbot response:', response);
    if (response.indexOf('The following errors were reported by the server') !== -1) {
        throw new Error('DOMAIN_DNS_FAILED');
    }
    const parentCert = success[0];
    const baseDir = path.join(`/etc/letsencrypt/live/${parentCert}`);
    const certificates = ['cert.pem', 'chain.pem', 'fullchain.pem', 'privkey.pem'];
    if (fs.existsSync(baseDir)) {
        for (let certName of certificates) {
            const certFile = path.join(baseDir, certName);
            if (!fs.existsSync(certFile)) {
                log('Missing cert file: ' + certFile);
                continue;
            }
            log('Adding cert file: ' + certFile);
            await redis.publisher.set('keys:' + parentCert + ':' + certName, JSON.stringify({
                certificate: fs.readFileSync(
                    certFile,
                    'utf-8'
                )
            }));
        }
    }
    for (let item of success) {
        log('redis:set:' + 'certs:' + item);
        log('redis:sAdd:' + 'certs');
        await redis.publisher.set('certs:' + item, success[0]).catch(handleCatch);
        await redis.publisher.sAdd('certs', item).catch(handleCatch);
    }
    return {
        domains: success,
        response: response
    };
};
