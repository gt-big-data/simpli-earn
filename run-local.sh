#!/usr/bin/env bash
# Deprecated alias — use ./start-app instead.
set -e
cd "$(dirname "$0")"
echo "Note: prefer ./start-app (this script forwards to it)."
exec ./start-app "$@"
