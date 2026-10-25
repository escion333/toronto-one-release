#!/bin/sh
set -eu
# The server owns secrets/receipts. Each resident-controlled browser uses a distinct
# unprivileged uid, a private home/profile, no supplementary groups and no capabilities.
case "${TORONTO_BROWSER_UID:-}" in ''|*[!0-9]*) exit 1 ;; esac
[ "$TORONTO_BROWSER_UID" -ge 40000 ] || exit 1
for argument in "$@"; do
  case "$argument" in
    --user-data-dir=/tmp/playwright_chromiumdev_profile-*)
      profile="${argument#--user-data-dir=}"
      chown -R "$TORONTO_BROWSER_UID:$TORONTO_BROWSER_UID" "$profile"
      chmod 700 "$profile"
      ;;
  esac
done
chown "$TORONTO_BROWSER_UID:$TORONTO_BROWSER_UID" "$HOME"
cd "$HOME"
exec /usr/bin/setpriv --reuid="$TORONTO_BROWSER_UID" --regid="$TORONTO_BROWSER_UID" --clear-groups --bounding-set=-all --no-new-privs "$TORONTO_CHROMIUM_PATH" "$@"
