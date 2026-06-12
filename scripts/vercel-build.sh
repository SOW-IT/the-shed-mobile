#!/bin/bash
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  npx convex deploy
else
  npx convex deploy --preview-name "${VERCEL_GIT_COMMIT_REF:-preview}"
fi

npx expo export --platform web
