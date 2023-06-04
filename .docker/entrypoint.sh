#!/bin/sh
set -e
sed -i "s/DB_DOMAIN_NAME_SED_PLACEHOLDER/$DB_DOMAIN_NAME/g" /app/ecosystem.config.js 

# Start the main process
exec "$@"