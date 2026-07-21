#!/bin/bash
# Make the standalone build actually runnable.
#
# `next build` emits .next/standalone carrying only the traced dependencies, but
# leaves out .next/static and public/ — the assets. Without them the app serves
# HTML and nothing else.
#
# It does NOT need a .env here: the UI's runtime env (NEXTAUTH_SECRET, the
# NEXT_PUBLIC_* device flags) is device state and is injected into the process by
# apollo-ui-v2.service via EnvironmentFile=/opt/apolloapi/apolloui-v2.env. Putting
# a .env inside the release was wrong — the standalone loads it relative to
# itself, which moves with current/, so after a migration the server had no
# NEXTAUTH_SECRET and login broke.
#
# Run automatically as the `postbuild` hook, so every caller (six install/update
# scripts plus the release workflow) gets it from one place instead of repeating
# the copy and drifting apart.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
STANDALONE=.next/standalone

if [ ! -d "$STANDALONE" ]; then
    echo "assemble-standalone: no build at $STANDALONE (is output:'standalone' set?)" >&2
    exit 1
fi

# Idempotent on purpose: cp into an existing directory nests it (static/static),
# which quietly doubled the asset weight of every release artifact.
rm -rf "$STANDALONE/.next/static" "$STANDALONE/public"
cp -r .next/static "$STANDALONE/.next/static"
cp -r public "$STANDALONE/public"

echo "assemble-standalone: $(du -sh "$STANDALONE" | cut -f1) at $STANDALONE"
