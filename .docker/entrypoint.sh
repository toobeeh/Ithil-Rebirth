#!/bin/sh
set -e
sed -i "s/DB_DOMAIN_NAME_SED_PLACEHOLDER/$DB_DOMAIN_NAME/g" /app/ecosystem.config.js 
sed -i "s/S3_KEY_SED_PLACEHOLDER/$S3_KEY/g" /app/ecosystem.config.js 
sed -i "s/S3_SECRET_SED_PLACEHOLDER/$S3_SECRET/g" /app/ecosystem.config.js 

# Start the main process
exec "$@"