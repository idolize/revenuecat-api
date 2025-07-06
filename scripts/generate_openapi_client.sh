#!/bin/bash

OPENAPI_FILE="./downloaded/openapi.yaml"

if [ ! -f "$OPENAPI_FILE" ]; then
  curl -o "$OPENAPI_FILE" https://www.revenuecat.com/docs/redocusaurus/plugin-redoc-0.yaml
fi

npx openapi-typescript "$OPENAPI_FILE" -o ./src/__generated/revenuecat-api-v2.d.ts
