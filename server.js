const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const redis = require('redis');
const exec = require('child_process').execSync;
const execBase = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const cwd = process.cwd();
const certDb = path.join('/app/db/certs.json');
const jobDir = path.join(cwd, '/db/jobs');
const logDir = path.join(cwd, '/db/logs');
const nginxConf = path.join('/etc/nginx/conf.d/default.conf');
const nginxDefaultConf = fs.readFileSync(
    path.join(cwd, '/template/nginx-default.conf'), 'utf-8'
);

const server = express();
const httpServer = http.createServer(server);
const params = {
    host: 'redis',
    port: 6379,
    prefix: 'senl:'
};

if (!fs.existsSync(certDb)) {
    fs.writeFileSync(certDb, JSON.stringify({}), 'utf-8');
}

if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir);
}

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir);
}

function env (key, defaultValue = null) {
    return process.env[key] || defaultValue;
}

function execute (command) {
    return new Promise(function (resolve) {
        execBase(command, function(error, stdout, stderr) {
            resolve(stdout);
        });
    })
}

async function checkDomain (domain) {
    const request = await fetch('http://' + domain + '/heartbeat').catch(e => {
        console.log(e);
        return false;
    });
    if (!request) {
        return false;
    }
    const data = await request.json().catch(() => false);
    if (!data) {
        return false;
    }
    return data.success !== undefined;
}

async function certbot ({email, domain}) {
    const checkDomains = domain.split(',').map(i => i.trim());
    const activeCerts = getActiveCerts();
    if (activeCerts[checkDomains[0]] !== undefined) {
        throw new Error('DOMAIN_ALREADY_EXISTS');
    }
    let domains = '';
    let success = [];
    let fail = [];
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
        // '--force-renewal ' +
        '--webroot -w /usr/share/nginx/html';

    const response = await execute(cmd);
    let certs = fs.readFileSync(certDb, 'utf-8');
    certs = JSON.parse(certs);
    for (let item of success) {
        certs[item] = success[0];
    }
    fs.writeFileSync(
        certDb,
        JSON.stringify({
            ...certs
        }),
        'utf-8'
    );
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
    return template;
}

async function updateNginxConf () {
    const liveDir = path.join('/etc/letsencrypt/live');
    let template = nginxDefaultConf + '\n# Auto-generated \n\n';
    let certs = JSON.parse(fs.readFileSync(certDb, 'utf-8'));
    for (let domain of Object.keys(certs)) {
        const cert = path.join(liveDir, certs[domain], '/cert.pem');
        if (fs.existsSync(cert)) {
            template += await addDomain(certs[domain], domain);
        }
    }

    fs.writeFileSync(nginxConf, template, 'utf-8');
    await reloadNginx().catch(e => {
        console.log('failed');
        console.log(e);
    });

    return template;
}

async function reloadNginx () {
    const r = await execute('nginx -t');
    const reload = await execute('nginx -s reload');
    console.log(r, reload);
}

function getActiveCerts () {
    return JSON.parse(fs.readFileSync(certDb, 'utf-8'));
}

function log (...message) {
    fs.appendFileSync(path.join(logDir, '/jobs.log'), message.join('\n') + '\n');
    process.stdout.write(message.join('\n') + '\n');
}

function isJob (id) {
    return fs.existsSync(getJobFile(id));
}

function getJob (id) {
    if (!isJob(id)) {
        return false;
    }
    try {
        return JSON.parse(fs.readFileSync(getJobFile(id), 'utf-8'))
    } catch (e) {
        return false;
    }
}

function getJobFile (id) {
    return path.join(jobDir, '/' + id + '.json');
}

function clearJob (id) {
    if (isJob(id)) {
        fs.unlinkSync(getJobFile(id));
    }
}

async function job (id) {
    const job = getJob(id);
    clearJob(id);
    if (!job) {
        return false;
    }
    await certbot({
        email: job.email,
        domain: job.domain
    }).catch(e => {
        if (e.message === 'DOMAIN_DNS_FAILED') {
            fs.writeFileSync(getJobFile(id), JSON.stringify(job), 'utf-8');
        }
    });
}

/**
 *
 * @param params
 * @returns {RedisClient}
 */
function createClient (params) {
    params.retry_strategy = function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
    };
    return redis.createClient(params);
}

async function heartbeat (req, res) {
    res.header('SE-Heartbeat', '1');
    return {
        success: true
    };
}

async function main () {
    const subscriber = createClient(params);
    const publisher = createClient(params);

    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({
        extended: true
    }));

    server.use(async function (req, res) {
        const method = req.method.toUpperCase();
        let response = {
            success: true
        };
        if (req.path === '/heartbeat' && method === 'GET') {
            response = await heartbeat(req, res);
        } else if (req.path === '/letsencrypt' && method === 'POST') {
            const id = new Date().getTime();
            const job = {
                id: id,
                email: req.body.email,
                domain: req.body.domain
            };
            // fs.writeFileSync(path.join(jobDir, '/' + id + '.json'), job, 'utf-8');
            publisher.publish('nginx-letsencrypt', JSON.stringify({
                action: 'job',
                payload: job
            }));

            response = {
                processing: id
            };
        }
        res.send(response);
    });

    subscriber.on('message', async (channel, message) => {
        console.log('got message:', channel, message);
    });

    subscriber.subscribe('nginx-letsencrypt');
    httpServer.listen(3000);
}

main()
    .catch(e => {
        console.log('Error:');
        console.log(e);
    });
