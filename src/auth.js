const {randomStr} = require('./util');
const redis = require('./redis');

exports.generate = async function () {
    const key = randomStr(32);
    const pass = randomStr(32);
    await redis.publisher.sAdd('tokens', key);
    await redis.publisher.set('tokens:' + key, pass);
    return key + ':' + pass;
};

exports.verify = async function (token) {
    const parts = token.split(':');
    if (parts[1] === undefined) {
        throw new Error('Not a valid request token.');
    }
    const pass = await redis.publisher.get('tokens:' + parts[0]);
    if (!pass) {
        throw new Error('Not a valid token');
    }
    if (parts[1] !== pass) {
        throw new Error('Token miss-match');
    }
    return true;
};
