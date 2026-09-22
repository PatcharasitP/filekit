#!/usr/bin/env bash
# กลุ่ม contract: FileKit ต้องไม่ทำ FlowKit พัง (แผนเว็บ FlowKit แยก ข้อ 6.3 , 22/09/2026)
#
# ‼️ ทำไมต้องมี: FlowKit (repo flowkit) import src/i18n.js , src/handoff.js , src/inapp.js ของเราตรง ๆ ข้ามเว็บ
#    สองเว็บปล่อยของคนละจังหวะ ถ้าเราเปลี่ยน export หรือพฤติกรรมไฟล์พวกนี้ FlowKit บนเว็บจริงพังทันทีโดยไม่มีใครแตะ FlowKit
#    จึงรันเทสของ FlowKit กับ FileKit ชุดนี้ (ในเครื่อง ยังไม่ปล่อย) ก่อนปล่อย FileKit ทุกครั้ง
# ตรวจ ① shared_contract.test.mjs ของ FlowKit ชี้ FileKit ชุดนี้ (export ครบ ใช้ได้จริง)
#      ② เทสเบราว์เซอร์ของ FlowKit 3 ชุดที่ใช้ไฟล์กลางจริง บนเซิร์ฟเวอร์ที่ mount FlowKit กับ FileKit ชุดนี้
#         browser_handoff (handoff.js) , browser_flowkit (i18n inapp) , browser_flowa11y (สลับภาษา)
# ‼️ ไม่เจอโฟลเดอร์ FlowKit = แดง พร้อมบอกวิธีแก้ ไม่ข้ามเงียบ (กติกา "ไม่มีสรุป = แดง")
#
# ใช้: tests/contract.sh        (runp.sh contract และ runp.sh all เรียกตัวนี้)
#      FLOWKIT_DIR=/ที่อื่น tests/contract.sh
set -u
cd "$(dirname "$0")/.."
FK="$(pwd)"
FL="${FLOWKIT_DIR:-$FK/../FlowKit}"
PY="${PY:-$FK/../.venv/bin/python}"
if [ ! -f "$FL/tests/shared_contract.test.mjs" ] || [ ! -f "$FL/tests/serve.py" ]; then
  echo "❌ ไม่เจอ FlowKit ที่ $FL (clone repo flowkit ไว้ข้าง ๆ FileKit หรือตั้ง FLOWKIT_DIR)"; exit 1
fi
fail=0
echo "━━ ① สัญญาไฟล์กลาง (FlowKit shared_contract กับ FileKit ชุดนี้) ━━"
FILEKIT_DIR="$FK" node "$FL/tests/shared_contract.test.mjs" 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|To eliminate\|trace-warnings" | tail -4
[ "${PIPESTATUS[0]}" = "0" ] || fail=1

PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
python3 "$FL/tests/serve.py" "$PORT" --flowkit "$FL" --filekit "$FK" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/flowkit/draw/" && break; sleep 0.2; done
for t in browser_handoff browser_flowkit browser_flowa11y; do
  echo "━━ ② FlowKit $t บน FileKit ชุดนี้ ━━"
  ORIGIN="http://127.0.0.1:$PORT" timeout "${TMO:-600}" "$PY" "$FL/tests/$t.py" > "/tmp/fk-contract-$t.log" 2>&1
  rc=$?
  grep -E "^ผ่าน [0-9]+ ข้อ" "/tmp/fk-contract-$t.log" | tail -1
  [ "$rc" = "0" ] || { fail=1; echo "  ❌ $t ตก (log /tmp/fk-contract-$t.log)"; }
done
[ "$fail" = "0" ] && echo "✅ contract ผ่าน FlowKit ใช้ไฟล์กลางของ FileKit ชุดนี้ได้ครบ" || echo "❌ contract ไม่ผ่าน ห้ามปล่อย FileKit จนกว่า FlowKit จะใช้ได้"
exit $fail
