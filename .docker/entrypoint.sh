#!/bin/sh
set -e
sed -i "s/DB_DOMAIN_NAME_SED_PLACEHOLDER/$DB_DOMAIN_NAME/g" /app/ecosystem.config.js 

certbot certonly --standalone --agree-tos --email $LETSENCRYPT_EMAIL --domain $SOCKET_DOMAIN_NAME --non-interactive --keep-until-expiring
crond

# Start the main process
exec "$@"