FROM node:11

ADD . /app/
WORKDIR /app/

RUN chmod +x /app/manager/entrypoint.sh \
    && apt-get update \
    && apt-get -y install nano \
    && apt-get -y install openssl \
    && apt-get -y install cron \
    && wget https://dl.eff.org/certbot-auto \
    && chmod a+x certbot-auto \
    && rm -rf /app/node_modules \
    && cd /app && npm install

RUN touch /var/log/cron.log
RUN touch /var/log/letsencrypt.log

ENTRYPOINT ["bash", "/app/manager/entrypoint.sh", "2>&1"]
