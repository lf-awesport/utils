#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
# npm run build # uncomment if required

# Se non siamo su Render, esci
if [[ "$RENDER" != "true" ]]; then
  echo "🧪 Ambiente locale rilevato: salta installazione Chromium"
  exit 0
fi

# Store/pull Puppeteer cache with build cache
if [[ -d "$XDG_CACHE_HOME/puppeteer" ]]; then
  echo "📦 Copying Puppeteer Cache from Build Cache" 
  cp -R "$XDG_CACHE_HOME/puppeteer/" "$PUPPETEER_CACHE_DIR"
else 
  echo "⚠️ Nessuna Puppeteer Cache trovata, verrà installata da zero"
fi
