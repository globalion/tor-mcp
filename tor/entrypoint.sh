#!/bin/sh
# Bootstrap: hash the control-port password and inject into a runtime torrc.
# Then exec tor. Tor takes ~10-30s to bootstrap the first circuit.

set -eu

if [ -z "${TOR_CONTROL_PASSWORD:-}" ]; then
  echo "TOR_CONTROL_PASSWORD not set; control port will require no auth (bad!)" >&2
  # Refuse to boot without a password rather than expose an open control port.
  # If you need to run without control-port auth, comment the exit line.
  exit 1
fi

HASHED=$(tor --hash-password "$TOR_CONTROL_PASSWORD" | tail -1)

# Append the hashed password line to /etc/tor/torrc — the file is read at
# boot only, so this is safe to do once here.
{
  cat /etc/tor/torrc
  echo ""
  echo "HashedControlPassword $HASHED"
} > /tmp/torrc

exec tor -f /tmp/torrc
