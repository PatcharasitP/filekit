"""
ตรวจว่าทุกตัวอักษรที่ "ผู้ใช้เห็นบนหน้าจอจริง" มีอยู่ในฟอนต์ของเรา

‼️ ตัวที่ฟอนต์ไม่มีจะตกไปใช้ฟอนต์อื่นของระบบ → เห็นเป็น "ฟอนต์สองแบบปนกัน"
   เคยเกิดจริงกับตัว ⇄ ในชื่อเครื่องมือ 2 ตัว (Sarabun ต้นฉบับมีแค่ ← ↑ → ↓)
‼️ ห้ามตรวจด้วยการวัดความกว้างในเบราว์เซอร์ — มันวัดฟอนต์สำรองให้ แล้วรายงานว่า "มี" ทั้งที่ขาด
‼️ ห้ามตรวจด้วยการกวาดไฟล์ซอร์ส — จะติดตัวอักษรในคอมเมนต์ที่ผู้ใช้ไม่เห็น
"""
import sys, os, json, subprocess, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
PY_BIN = str(ROOT.parent / ".venv/bin/python")
FONT = str(ROOT / "vendor/fonts/Sarabun-Regular.woff2")

# อีโมจิและสัญลักษณ์ภาพที่ตั้งใจให้ระบบวาดเอง (ฟอนต์ข้อความไม่ต้องมี)
def is_pictograph(cp):
    # ‼️ ⁉️ เป็นอักขระที่มี "รูปแบบอีโมจิ" ระบบวาดเป็นภาพสีให้เอง ไม่ใช่ตัวหนังสือ
    return (cp >= 0x1F000 or 0x2600 <= cp <= 0x27BF or cp in (0xFE0F, 0x200D, 0x20E3, 0x203C, 0x2049)
            or 0x2B00 <= cp <= 0x2BFF or 0x2190 <= cp <= 0x21FF and cp not in (0x2190,0x2191,0x2192,0x2193))

cmap = set(json.loads(subprocess.run([PY_BIN, "-c", '''
from fontTools.ttLib import TTFont; import json, sys
t = TTFont(sys.argv[1]); s = set()
for tb in t["cmap"].tables: s |= set(tb.cmap.keys())
print(json.dumps(sorted(s)))''', FONT], capture_output=True, text=True, check=True).stdout))

TOOLS = json.loads(subprocess.run(["node", "--input-type=module", "-e",
    'import {TOOLS} from "./src/registry.js"; console.log(JSON.stringify(TOOLS.map(t=>t.id)))'],
    cwd=str(ROOT), capture_output=True, text=True, check=True).stdout)

GRAB = """() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = new Set(); let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest("script,style") || !el.offsetParent && el.tagName !== "BODY") continue;
    for (const ch of n.textContent) out.add(ch);
  }
  // ข้อความใน placeholder / aria-label / title ก็เป็นสิ่งที่ผู้ใช้เห็นหรือได้ยิน
  for (const e of document.querySelectorAll("[placeholder],[aria-label],[title]"))
    for (const a of ["placeholder","aria-label","title"])
      for (const ch of (e.getAttribute(a) || "")) out.add(ch);
  return [...out];
}"""

# ‼️ ต้องกวาดทั้งสองภาษา — คำแปลอังกฤษเพิ่มตัวอักษรที่ตอนทำ subset ยังไม่มีในเว็บได้
missing = {}
pages = [""] + [f"#/{t}" for t in TOOLS]
with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in ("th", "en"):
        ctx = b.new_context(viewport={"width": 1280, "height": 950})
        ctx.add_init_script(f"try{{localStorage.setItem('fk-lang','{lang}')}}catch(e){{}}")
        pg = ctx.new_page()
        for h in pages:
            pg.goto("about:blank"); pg.goto(f"{BASE}/{h}", wait_until="networkidle"); pg.wait_for_timeout(320)
            for ch in pg.evaluate(GRAB):
                cp = ord(ch)
                if cp < 0x20 or cp == 0x7F or ch.isspace() or is_pictograph(cp) or cp in cmap: continue
                missing.setdefault(ch, set()).add(f"{lang}:{h or 'หน้าแรก'}")
        ctx.close()
    b.close()

print(f"ฟอนต์มี {len(cmap)} อักขระ · ตรวจ {(len(TOOLS)+1)*2} หน้า (ไทย+อังกฤษ)")
if not missing:
    print("✅ ทุกตัวอักษรที่ผู้ใช้เห็น มีอยู่ในฟอนต์ครบ — ไม่มีฟอนต์ปนกัน")
    sys.exit(0)
print(f"❌ พบ {len(missing)} ตัวที่ฟอนต์ขาด (จะถูกวาดด้วยฟอนต์อื่น = เห็นเป็นสองแบบ):")
for ch, where in missing.items():
    print(f'   "{ch}"  U+{ord(ch):04X}   พบที่: {", ".join(sorted(where))[:110]}')
sys.exit(1)
