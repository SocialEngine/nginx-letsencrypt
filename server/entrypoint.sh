#!/usr/bin/env bash

source /app/core/functions.sh

check_writable_directory '/etc/nginx/certs'
check_writable_directory '/etc/nginx/vhost.d'
check_writable_directory '/usr/share/nginx/html'

if check_docker_link "redis" "${REDIS_HOST}" "${REDIS_PORT}"; then
    echo "Redis is running on ${REDIS_HOST}:${REDIS_PORT}"
fi

ls -ala /app/server

echo "Updating nginx config"
cd /app && node ./console nginx:init

echo "Starting nginx..."
nginx
echo "Starting node listener..."
cd /app && ./node_modules/.bin/forever ./server/listener.js
cd /app && ./node_modules/.bin/forever --fifo logs 0 &
wait
