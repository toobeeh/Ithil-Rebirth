FROM node:16-slim as node-builder

WORKDIR /app/

# Copy files for app
COPY . /app/

RUN echo "Installing npm modules..." && \
    npm install || exit 1 && \
    echo "npm modules installed." && \
    npm cache clean --force

# Build for production env
RUN echo "Building app...\n" && \
    npm run build && \
    echo "build was completed."

FROM node:alpine
RUN npm install pm2 -g

# default env values for db domain name
ARG DB_DOMAIN_NAME="db.domain.tld"
ENV DB_DOMAIN_NAME "${DB_DOMAIN_NAME}"

# default env values for s3 config
ARG S3_KEY="S3_KEY"
ARG S3_SECRET="S3_SECRET"
ENV S3_KEY "${S3_KEY}"
ENV S3_SECRET "${S3_SECRET}"

WORKDIR /app/
COPY --from=node-builder /app /app

# Install app dependencies
ENV NPM_CONFIG_LOGLEVEL warn
RUN npm install --production

# Show current folder structure in logs
RUN ls -al -R

EXPOSE 4000 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010

# Copy the entrypoint script
COPY .docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD [ "pm2-runtime", "start", "ecosystem.config.js" ]