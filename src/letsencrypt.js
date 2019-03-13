const exec = require('child_process').execSync;
const fetch = require('node-fetch');
const {env, execute, handleCatch, log} = require('./util');
const {publisher, key} = require('./redis');
const fs = require('fs');
const path = require('path');

async function getCertParent (domain) {
    return publisher.get(key('certs:' + domain));
}

async function getCert (domain) {
    const parentCert = await getCertParent(domain);
    if (!parentCert) {
        return false;
    }
    return {
        parent: parentCert
    };
}

async function getCerts () {
    const certs = {};
    const members = await publisher.sMembers(key('certs'));
    for (let member of members) {
        certs[member] = await getCertParent(member);
    }
    return certs;
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

async function certbot ({email, domain, force = false}) {
    const checkDomains = domain.split(',').map(i => i.trim());
    const activeCerts = await getCerts();
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
        domains + ' ' +
        '--expand ' +
        (force === false ? '' : '--force-renewal ') +
        '--webroot -w /usr/share/nginx/html';

    const response = await execute(cmd);
    log('response2', response);
    if (response.indexOf('The following errors were reported by the server') !== -1) {
        throw new Error('DOMAIN_DNS_FAILED');
    }
    const parentCert = success[0];
    const baseDir = path.join(`/etc/letsencrypt/live/${parentCert}`);
    const certificates = ['cert.pem', 'chain.pem', 'fullchain.pem', 'privatekey.pem'];
    if (fs.existsSync(baseDir)) {
        for (let certName of certificates) {
            await publisher.set(key('keys:' + parentCert + ':' + certName), JSON.stringify({
                certificate: fs.readFileSync(
                    path.join(baseDir, certName),
                    'utf-8'
                )
            }));
        }
    }
    for (let item of success) {
        await publisher.set(key('certs:' + item), success[0]).catch(handleCatch);
        await publisher.sAdd(key('certs'), item).catch(handleCatch);
    }
    return {
        domains: success,
        response: response
    };
}

async function addDomain (cert, domain) {
    exec(`ln -sf /etc/letsencrypt/live/${cert}/privkey.pem /etc/nginx/certs/${domain}.key`);
    exec(`ln -sf /etc/letsencrypt/live/${cert}/fullchain.pem /etc/nginx/certs/${domain}.crt`);
    exec(`ln -sf /etc/letsencrypt/dhparam.pem /etc/nginx/certs/${domain}.dhparam.pem`);
    console.log('Domain:', domain, 'Cert:', cert);
    /* eslint-disable */
    const template = `
upstream ${domain} {
    # Access through rancher managed network
    server ${env('UPSTREAM_HOST', 'localhost')}:${env('UPSTREAM_PORT', '8080')};

    server localhost down;
}

server {
    server_name ${domain};
    listen 80 ;
    access_log /var/log/nginx/access.log vhost;
    location / {
        return 301 https://$host:443$request_uri;
    }
}

server {
    server_name ${domain};
    listen 443 ssl http2 ;
    access_log /var/log/nginx/access.log vhost;

    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:!DSS';

    ssl_prefer_server_ciphers on;
    ssl_session_timeout 5m;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_certificate /etc/nginx/certs/${domain}.crt;
    ssl_certificate_key /etc/nginx/certs/${domain}.key;
    ssl_dhparam /etc/nginx/certs/${domain}.dhparam.pem;
    add_header Strict-Transport-Security "max-age=31536000";
    
    location /.well-known/acme-challenge/ {
        allow all;
        root /usr/share/nginx/html;
        try_files $uri =404;
        break;
    }

    location / {
        proxy_pass http://${domain};
    }
}    
    `;
    /* eslint-enable */
    return template;
}

module.exports = {
    addDomain: addDomain,
    certbot: certbot,
    getCerts: getCerts,
    getCert: getCert
};
