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
if [[ ! -d $PUPPETEER_CACHE_DIR ]]; then 
  echo "📦 Copying Puppeteer Cache from Build Cache" 
  cp -R $XDG_CACHE_HOME/puppeteer/ $PUPPETEER_CACHE_DIR
else 
  echo "💾 Storing Puppeteer Cache in Build Cache" 
  cp -R $PUPPETEER_CACHE_DIR $XDG_CACHE_HOME
fi
