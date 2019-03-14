const redis = require('../core/redis');
const util = require('../core/util');

redis.subscriber.on('message', async (name, message) => {
    if (typeof message === 'string' && message === 'ping') {
        util.log('-- pong --');
        return null;
    }
    if (name === redis.channel) {
        try {
            message = JSON.parse(message);
            util.log('got message:', message);
            // util.execute('node /app/src/console.js ' + message.action + ' ' + message.payload.id);
        } catch (e) {}
    }
});

redis.subscriber.subscribe(redis.channel);
redis.publisher.publish(redis.channel, 'ping');
