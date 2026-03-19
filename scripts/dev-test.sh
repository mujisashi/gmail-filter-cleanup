#!/usr/bin/env bash
# dev-test.sh — Start dev server, open browser to log in, then QA with cookies
set -e

B="$(git rev-parse --show-toplevel)/.claude/skills/gstack/browse/dist/browse"
PORT=3000
URL="http://localhost:$PORT"

# ── Check .env.local has real creds ───────────────────────────────────────────
if ! grep -q "GOOGLE_CLIENT_ID=" .env.local 2>/dev/null || grep -q "placeholder" .env.local 2>/dev/null; then
  echo ""
  echo "  .env.local is missing or has placeholder credentials."
  echo ""
  echo "  Create a Google OAuth app at https://console.cloud.google.com/"
  echo "  then fill in .env.local:"
  echo ""
  echo "    GOOGLE_CLIENT_ID=..."
  echo "    GOOGLE_CLIENT_SECRET=..."
  echo "    NEXTAUTH_SECRET=$(openssl rand -base64 32)"
  echo "    NEXTAUTH_URL=http://localhost:$PORT"
  echo ""
  exit 1
fi

# ── Kill any existing dev server on the port ──────────────────────────────────
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# ── Start dev server in background ───────────────────────────────────────────
echo "Starting dev server on $URL…"
bun dev &
DEV_PID=$!
trap "kill $DEV_PID 2>/dev/null" EXIT

# Wait for it to be ready
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null -w "%{http_code}" $URL | grep -q "200"; then
    echo "Server ready."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Server didn't start in 30s. Check for errors above."
    exit 1
  fi
done

# ── Open real browser so user can log in ─────────────────────────────────────
echo ""
echo "Opening $URL in your browser — sign in with Google."
open "$URL"
echo ""
echo "  After you've signed in, come back here and press ENTER."
read -r

# ── Import cookies from real browser into headless browser ───────────────────
echo ""
echo "Importing cookies from your browser…"
"$B" cookie-import-browser --domain localhost

# ── Navigate to /audit and screenshot ────────────────────────────────────────
echo ""
echo "Navigating to /audit…"
"$B" goto "$URL/audit"
"$B" snapshot -i

SHOT=".gstack/qa-reports/screenshots/audit-authed-$(date +%Y%m%d-%H%M%S).png"
mkdir -p .gstack/qa-reports/screenshots
"$B" screenshot "$SHOT"
echo ""
echo "Screenshot saved: $SHOT"
open "$SHOT"

# ── Console check ─────────────────────────────────────────────────────────────
echo ""
echo "Console errors:"
"$B" console --errors

echo ""
echo "Done. Dev server running at $URL (PID $DEV_PID)."
echo "Press Ctrl+C to stop."
wait $DEV_PID
