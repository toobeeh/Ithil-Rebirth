FROM node:16-slim as node-builder

WORKDIR /app/

# Copy files for app
COPY . /app/

RUN echo "Installing npm modules..." && \
    npm install || exit 1 && \
    echo "npm modules installed." && \
    npm cache clean --force

# install over idk
RUN echo "Installing npm modules..." && \
    npm install || exit 1 && \
    echo "npm modules installed." && \
    npm cache clean --force

# Build for production env
RUN echo "Building app...\n" && \
    npm run build && \
    echo "build was completed."

FROM keymetrics/pm2:latest-alpine

# default env values for domain name
ARG DB_DOMAIN_NAME="db.domain.tld"
ENV DB_DOMAIN_NAME "${DB_DOMAIN_NAME}"

WORKDIR /app/
COPY --from=node-builder /app /app

# Install app dependencies
ENV NPM_CONFIG_LOGLEVEL warn
RUN npm install --production

# Show current folder structure in logs
RUN ls -al -R

EXPOSE 4000 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010

CMD [ "pm2", "start", "ecosystem.config.js" ]