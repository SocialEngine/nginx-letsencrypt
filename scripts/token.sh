#!/usr/bin/env bash

source ./core/functions.sh

docker exec -it "$(get_working_dir)"_manager_1 node /app/console token
