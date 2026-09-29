#!/bin/bash
# Full backend validation: fresh seed → start server → run both test suites.
# Usage: bash backend/scripts/validate.sh
set -e
cd "$(dirname "$0")/.."

echo "→ Reseeding database..."
rm -f mediqueue.db
node seed.js > /dev/null

echo "→ Starting server on :3000..."
node server.js > /tmp/mq-server.log 2>&1 &
SERVER_PID=$!
sleep 3

if ! curl -s --max-time 5 http://localhost:3000/api/doctors > /dev/null; then
  echo "✗ Server failed to start:"; tail -10 /tmp/mq-server.log; exit 1
fi

echo "→ Running E2E suite..."
PASS=0; FAIL=0
node scripts/test_e2e.js | tee /tmp/e2e-out.txt | grep -E "RESULT" || true
E2E_EXIT=${PIPESTATUS[0]}
echo "→ Running journey suite..."
node scripts/test_journey.js | grep -E "RESULT" || true
J_EXIT=${PIPESTATUS[0]}

kill $SERVER_PID 2>/dev/null || true
echo
if [ $E2E_EXIT -eq 0 ] && [ $J_EXIT -eq 0 ]; then echo "✅ ALL BACKEND VALIDATION PASSED"; else echo "❌ VALIDATION FAILURES (e2e=$E2E_EXIT journey=$J_EXIT)"; exit 1; fi
