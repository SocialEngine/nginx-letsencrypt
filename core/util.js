const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const util = require('./util');

exports.handleError = function (e) {
    console.log('Error:');
    console.log(e);
    let message = e;
    if (message instanceof Error) {
        message = e;
    }
    this.log('Error:', message);
    return false;
};

exports.handleCatch = function (e) {
    console.log('Silent Error:');
    console.log(e);
    return false;
};

exports.log = function (...message) {
    message = message.map(i => typeof i === 'object' ? JSON.stringify(i) : i).join('\n') + '\n';
    fs.appendFileSync(path.join('/var/log/nginx-letsencrypt.log'), message);
    process.stdout.write(message);
};

exports.env = function (key, defaultValue = null) {
    return process.env[key] || defaultValue;
};

exports.execute = function (command) {
    return new Promise(function (resolve) {
        console.log('Execute:', command);
        exec(command, function (error, stdout) {
            if (error) {
                util.handleError(error);
            }
            resolve(stdout);
        });
    });
};

exports.randomStr = function (length = 32, special = false) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    if (special) {
        possible += '$*()&%#!+=';
    }
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};
