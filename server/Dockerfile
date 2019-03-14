FROM node:11

EXPOSE 80
EXPOSE 443

ADD . /app/
WORKDIR /app/

RUN chmod +x /app/server/entrypoint.sh \
    && apt-get update \
    && apt-get -y install nano \
    && apt-get -y install nginx \
    && mkdir -p /etc/nginx/certs /etc/nginx/vhost.d /etc/nginx/conf.d /usr/share/nginx/html \
    && rm -f /etc/nginx/conf.d/default.conf \
    && rm -rf /etc/nginx/sites-enabled \
    && rm -rf /etc/nginx/sites-available \
    && rm -rf /app/node_modules \
    && cd /app && npm install

ADD server/nginx/default.conf /etc/nginx/conf.d/default.conf

RUN touch /var/log/letsencrypt.log

ENTRYPOINT ["bash", "/app/server/entrypoint.sh", "2>&1"]
