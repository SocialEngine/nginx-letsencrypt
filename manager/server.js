const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const {createJob} = require('../core/job');
const util = require('../core/util');
const {getCert} = require('../core/letsencrypt');
const auth = require('../core/auth');

const app = express();
const httpServer = http.createServer(app);

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

    app.get('/.well-known/acme-challenge/*', function (req, res) {
        util.log('acme challenge:', req.path);
        res.send('Success');
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

        util.execute('node /app/console job ' + job);
        res.send({
            processing: job
        });
    });

    app.use(function (req, res) {
        res.send('Page not found.');
    });

    httpServer.listen(3000);
}

main()
    .catch(e => {
        console.log('Error:');
        console.log(e);
    });
