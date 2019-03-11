FROM node:11

EXPOSE 80
EXPOSE 443

ADD . /app/
WORKDIR /app/

RUN chmod +x /app/entrypoint.sh \
    && apt-get update \
    && apt-get -y install nano \
    && apt-get -y install nginx \
    && apt-get -y install openssl \
    && wget https://dl.eff.org/certbot-auto \
    && chmod a+x certbot-auto \
    && mkdir -p /etc/nginx/certs /etc/nginx/vhost.d /etc/nginx/conf.d /usr/share/nginx/html /etc/letsencrypt \
    && sed -i 's/^http {/&\n    server_names_hash_bucket_size 128;/g' /etc/nginx/nginx.conf \
    && rm -f /etc/nginx/conf.d/default.conf \
    && rm -rf /etc/nginx/sites-enabled \
    && rm -rf /etc/nginx/sites-available \
    && rm -rf /app/node_modules \
    && cd /app && npm install

ADD ./template/nginx-default.conf /etc/nginx/conf.d/default.conf

ENTRYPOINT ["bash", "/app/entrypoint.sh", "2>&1"]
