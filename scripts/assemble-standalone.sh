#!/bin/bash
# Make the standalone build actually runnable.
#
# `next build` emits .next/standalone carrying only the traced dependencies, but
# leaves out three things it needs at runtime:
#
#   .next/static, public/   the assets. Without them the app serves HTML and
#                           nothing else.
#
#   .env                    the standalone server does process.chdir(__dirname)
#                           and loads .env from *its own* directory, so the UI's
#                           .env is invisible to it. That silently breaks
#                           next-auth (no NEXTAUTH_SECRET → sessions cannot be
#                           signed) and the NEXT_PUBLIC_* device flags.
#                           A symlink and not a copy, because set_UI_mode.sh
#                           rewrites that file on every boot — a copy would go
#                           stale and the UI would show the wrong device config.
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

# Relative, so it stays correct after the tarball is extracted anywhere.
ln -sfn ../../.env "$STANDALONE/.env"

echo "assemble-standalone: $(du -sh "$STANDALONE" | cut -f1) at $STANDALONE"
