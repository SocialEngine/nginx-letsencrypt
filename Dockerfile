FROM node:11

EXPOSE 80
EXPOSE 443

ADD . /app/
WORKDIR /app/

RUN chmod +x /app/docker/entrypoint.sh \
    && apt-get update \
    && apt-get -y install nano \
    && apt-get -y install nginx \
    && apt-get -y install openssl \
    && apt-get -y install cron \
    && wget https://dl.eff.org/certbot-auto \
    && chmod a+x certbot-auto \
    && mkdir -p /etc/nginx/certs /etc/nginx/vhost.d /etc/nginx/conf.d /usr/share/nginx/html /etc/letsencrypt \
    && sed -i 's/^http {/&\n    server_names_hash_bucket_size 128;\n    server_tokens off;/g' /etc/nginx/nginx.conf \
    && rm -f /etc/nginx/conf.d/default.conf \
    && rm -rf /etc/nginx/sites-enabled \
    && rm -rf /etc/nginx/sites-available \
    && rm -rf /app/node_modules \
    && cd /app && npm install

ADD ./docker/nginx-default.conf /etc/nginx/conf.d/default.conf

RUN touch /var/log/cron.log
RUN touch /var/log/nginx-letsencrypt.log

ENTRYPOINT ["bash", "/app/docker/entrypoint.sh", "2>&1"]
