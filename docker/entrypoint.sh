#!/usr/bin/env bash

function check_docker_link() {
    if [ $# -lt 3 ]; then
        echo "Usage: check_docker_link <name> <addr> <port>"

        return 1
    fi

    local name=${1}
    local addr=${2}
    local port=${3}

    if test -z "${addr}" -o -z "${port}"; then
        echo "No link for $name found, skipping..."

        return 1
    fi

    local test_url="tcp://$addr:$port"

    while ! exec 6<>/dev/tcp/${addr}/${port}; do
        echo "$(date) - still trying to connect to ${name} at ${test_url}"
        sleep 1
    done

    exec 6>&-
    exec 6<&-
    echo "Connected to ${name} at ${test_url}"

    return 0
}

function check_writable_directory {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        echo "Error: can't access to '$dir' directory !" >&2
        echo "Check that '$dir' directory is declared has a writable volume." >&2
        exit 1
    fi
    touch $dir/.check_writable 2>/dev/null
    if [[ $? -ne 0 ]]; then
        echo "Error: can't write to the '$dir' directory !" >&2
        echo "Check that '$dir' directory is export as a writable volume." >&2
        exit 1
    fi
    rm -f $dir/.check_writable
}

check_writable_directory '/etc/nginx/certs'
check_writable_directory '/etc/letsencrypt'
check_writable_directory '/etc/nginx/vhost.d'
check_writable_directory '/usr/share/nginx/html'

if [[ -z "$SERVER_ID" ]]; then
    echo "SERVER_ID variable is missing"
    exit 1
fi

if [[ ! -f /etc/letsencrypt/dhparam.pem ]]; then
    echo "Creating Diffie-Hellman group (can take several minutes...)"
    openssl dhparam -dsaparam -out /etc/letsencrypt/.dhparam.pem.tmp 4096
    mv /etc/letsencrypt/.dhparam.pem.tmp /etc/letsencrypt/dhparam.pem || exit 1
fi

if check_docker_link "redis" "${REDIS_HOST}" "${REDIS_PORT}"; then
    echo "Redis is running on ${REDIS_HOST}:${REDIS_PORT}"
fi

echo "Starting nginx..."
nginx
echo "Starting cron..."
(crontab -l ; echo "* * * * * echo "Running cron" >> /var/log/cron.log") | crontab
service cron start
service cron status
echo "Starting node server..."
cd /app && ./node_modules/.bin/forever ./src/server.js
cd /app && ./node_modules/.bin/forever --fifo logs 0 &
wait
