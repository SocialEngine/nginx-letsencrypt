#!/usr/bin/env bash

DIR="$( basename "$PWD" )"

docker exec -it "$DIR"_manager_1 /app/node_modules/.bin/forever restartall
docker exec -it "$DIR"_server_1 /app/node_modules/.bin/forever restartall
