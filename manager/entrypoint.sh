#!/usr/bin/env bash

source /app/core/functions.sh

check_writable_directory '/app/manager/letsencrypt'
check_writable_directory '/app/manager/certs'
check_writable_directory '/app/manager/public'

if [[ ! -f /app/manager/letsencrypt/dhparam.pem ]]; then
    echo "Creating Diffie-Hellman group (can take several minutes...)"
    openssl dhparam -dsaparam -out /app/manager/letsencrypt/.dhparam.pem.tmp 4096
    mv /app/manager/letsencrypt/.dhparam.pem.tmp /app/manager/letsencrypt/dhparam.pem || exit 1
fi

if check_docker_link "redis" "${REDIS_HOST}" "${REDIS_PORT}"; then
    echo "Redis is running on ${REDIS_HOST}:${REDIS_PORT}"
fi

echo "Starting cron..."
(crontab -l ; echo "* * * * * node /app/console ping >> /var/log/cron.log") | crontab
service cron start
service cron status
echo "Starting manager..."
cd /app && ./node_modules/.bin/forever ./manager/server.js
cd /app && ./node_modules/.bin/forever --fifo logs 0 &
wait
