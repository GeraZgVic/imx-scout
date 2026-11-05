#!/bin/sh
set -eu

: "${IMXSCOUT_DB_PASSWORD:?Set IMXSCOUT_DB_PASSWORD in .env.server}"

encoded_password=$(node -p 'encodeURIComponent(process.env.IMXSCOUT_DB_PASSWORD)')
export DATABASE_URL="mysql://imx:${encoded_password}@imxscout-db:3306/imxscout"

npx prisma migrate deploy
exec node src/server.js
