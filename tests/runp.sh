#!/usr/bin/env bash
# รันเทสเบราว์เซอร์แบบขนาน บนเซิร์ฟเวอร์ตัวเดียวที่ยืนยันแล้วว่าเสิร์ฟโค้ดชุดนี้จริง
#
# ‼️ ที่มา 21/09/2026: รันเรียงทีละชุดใช้เวลา ~4.5 ชั่วโมงสำหรับ 96 ชุด
#    ซึ่งนานเกินกว่าจะใช้ไล่หนี้เทสได้จริง (แก้ที ต้องรอที)
#    ชุดเทสเกือบทั้งหมดเป็น Playwright headless ที่อ่านอย่างเดียว จึงรันพร้อมกันได้
#
# ‼️ ข้อยกเว้นที่ห้ามรันขนาน อยู่ใน SOLO ด้านล่าง (วัดเวลา/วัดแคช/ตัดเน็ต ผลจะเพี้ยนถ้ามีคนแย่งเครื่อง)
#
# ใช้: tests/runp.sh all              (ทุกชุด)
#      tests/runp.sh browser_a11y browser_batch
#      JOBS=6 tests/runp.sh all       (ปรับจำนวนที่รันพร้อมกัน ค่าตั้งต้น 4)
set -u
cd "$(dirname "$0")/.."
PY="${PY:-../.venv/bin/python}"
JOBS="${JOBS:-4}"
OUT="${OUT:-/tmp/fk-runp}"

# ชุดที่ต้องรันเดี่ยว ๆ เพราะวัดเวลา วัดแคช หรือตัดเครือข่ายทั้งเครื่อง
SOLO="browser_perf browser_perfbudget browser_offline browser_cache browser_swupdate browser_crossbrowser"

python3 -m http.server 0 --bind 127.0.0.1 >/dev/null 2>&1 &
# http.server พอร์ต 0 ไม่บอกพอร์ตที่ได้ จึงขอพอร์ตว่างมาเองแล้วผูกตามนั้น
kill %1 2>/dev/null
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
want=$(grep -m1 -o 'filekit-v[0-9]*' sw.js); got=$(curl -s "http://127.0.0.1:$PORT/sw.js" | grep -m1 -o 'filekit-v[0-9]*')
if [ "$want" != "$got" ]; then echo "❌ เซิร์ฟเวอร์เสิร์ฟคนละชุด (ไฟล์ $want แต่ได้ $got) หยุด"; exit 2; fi
echo "▶ พอร์ต $PORT เสิร์ฟ $got  ขนานครั้งละ $JOBS ชุด  บันทึกไว้ที่ $OUT/"

if [ "${1:-}" = "all" ]; then
  set -- $(ls tests/browser_*.py tests/css_contract.py | sed 's#tests/##; s#\.py$##')
fi
rm -rf "$OUT"; mkdir -p "$OUT"

run_one() {
  t="$1"
  FK_BASE="http://127.0.0.1:$PORT" timeout "${TMO:-600}" "$PY" "tests/$t.py" >"$OUT/$t.log" 2>&1
  echo "$?" >"$OUT/$t.rc"
  if [ "$(cat "$OUT/$t.rc")" = "0" ]; then printf '  ✅ %s\n' "$t"; else printf '  ❌ %s\n' "$t"; fi
}

par=""; solo=""
for t in "$@"; do
  case " $SOLO " in *" $t "*) solo="$solo $t";; *) par="$par $t";; esac
done

# ‼️ ใช้ wait -n ปล่อยงานใหม่ทันทีที่มีช่องว่าง ไม่ใช่รอทั้งรุ่นให้จบพร้อมกัน
#    (รอทั้งรุ่น = ชุดที่ค้างจนครบเวลาลากทั้งรุ่นไว้ด้วย ซึ่งเป็นคอขวดจริงที่วัดได้ 21/09/2026)
running=0
for t in $par; do
  run_one "$t" &
  running=$((running+1))
  if [ "$running" -ge "$JOBS" ]; then wait -n; running=$((running-1)); fi
done
wait
for t in $solo; do run_one "$t"; done

fail=0; total=0
for f in "$OUT"/*.rc; do
  total=$((total+1)); [ "$(cat "$f")" = "0" ] || fail=$((fail+1))
done
echo "━━ รวม $total ชุด, ตก $fail ชุด  (log เต็มอยู่ใน $OUT/<ชื่อชุด>.log)"
[ "$fail" -eq 0 ]
