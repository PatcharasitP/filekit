#!/usr/bin/env bash
# รันเทสเบราว์เซอร์ของ FileKit บนพอร์ตที่ขอจากระบบ พร้อมยืนยันว่าเสิร์ฟโค้ดชุดนี้จริงก่อนยิง
#
# ‼️ ที่มา 13/09/2026: มี http.server เก่าจาก session ก่อนค้างอยู่ 10+ พอร์ต (8792 ถึง 8951)
#    คำสั่งเปิดเซิร์ฟเวอร์ใหม่พอร์ตซ้ำล้มเงียบ แต่เทสยังได้หน้า 200 จากตัวเก่า
#    จึงรายงานว่าของใหม่ "ไม่มี" ทั้งที่โค้ดใส่แล้ว เสียเวลาไล่ครึ่งชั่วโมง
#    กฎของโปรเจกต์: กับดักที่เจอแล้วต้องมีเครื่องบังคับ ไม่ใช่แค่จำ
#
# ใช้: tests/run.sh browser_theme browser_sidepanel        (ชื่อไฟล์ใน tests/ ไม่ต้องใส่ .py)
#      tests/run.sh all                                     (ทุก browser_*.py + css_contract)
set -u
cd "$(dirname "$0")/.."
PY="${PY:-../.venv/bin/python}"
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
# ยืนยันว่าเซิร์ฟเวอร์นี้เสิร์ฟไฟล์ในโฟลเดอร์นี้จริง (เทียบ VERSION ใน sw.js)
want=$(grep -m1 -o 'filekit-v[0-9]*' sw.js); got=$(curl -s "http://127.0.0.1:$PORT/sw.js" | grep -m1 -o 'filekit-v[0-9]*')
if [ "$want" != "$got" ]; then echo "❌ เซิร์ฟเวอร์เสิร์ฟคนละชุด (ไฟล์ $want แต่ได้ $got) หยุด"; exit 2; fi
echo "▶ พอร์ต $PORT เสิร์ฟ $got"
if [ "${1:-}" = "all" ]; then set -- $(ls tests/browser_*.py tests/css_contract.py | sed 's#tests/##; s#\.py$##'); fi
fail=0
for t in "$@"; do
  echo "##### $t"
  FK_BASE="http://127.0.0.1:$PORT" timeout 600 "$PY" "tests/$t.py"; rc=$?
  echo "exit=$rc"; [ $rc -ne 0 ] && fail=$((fail+1))
done
echo "━━ รวม: ตก $fail ชุด"
[ $fail -eq 0 ]
