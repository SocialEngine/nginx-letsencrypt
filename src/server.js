const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const redis = require('./redis');
const {createJob} = require('./job');
const util = require('./util');
const {getCert} = require('./letsencrypt');
const auth = require('./auth');

const app = express();
const httpServer = http.createServer(app);
const channel = 'nginx-letsencrypt';

async function api (req, res, next) {
    const token = req.headers['x-auth-token'] || '';
    if (!token) {
        return res.locals.error('Missing auth token', 401);
    }
    const check = await auth.verify(token).catch(e => {
        res.locals.error(e.message, 401);
        return false;
    });
    if (check) {
        return next();
    }
}

async function main () {
    app.use(function (req, res, next) {
        res.locals.error = function (message, type = 400) {
            return res.send(type, {
                error: true,
                message: message
            });
        };
        return next();
    });
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.get('/heartbeat', function (req, res) {
        res.header('SE-Heartbeat', '1');
        res.send({
            success: true
        });
    });

    app.use(api);

    app.get('/api/certs/:domain', async function (req, res) {
        res.send(await getCert(req.params.domain));
    });

    app.post('/api/certs', async function (req, res) {
        const body = req.body;
        const job = await createJob({
            email: body.email,
            domain: body.domain,
            force: body.force || false
        });
        redis.publisher.publish(channel, JSON.stringify({
            action: 'job',
            payload: {
                id: job
            }
        }));

        res.send({
            processing: job
        });
    });

    app.use(function (req, res) {
        res.send('Page not found.');
    });

    redis.subscriber.on('message', async (name, message) => {
        if (name === channel) {
            try {
                message = JSON.parse(message);
                util.execute('node /app/src/console.js ' + message.action + ' ' + message.payload.id);
            } catch (e) {}
        }
    });

    redis.subscriber.subscribe(channel);
    httpServer.listen(3000);
}

main()
    .catch(e => {
        console.log('Error:');
        console.log(e);
    });
