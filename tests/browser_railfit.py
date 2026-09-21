#!/usr/bin/env python3
"""รางสารบัญลอยซ้ายต้องไม่ทับเนื้อหา และหน้าต้องมีชื่อเรื่องให้เห็นเสมอทุกความกว้าง

‼️ ทำไมต้องมีเทสนี้ (18/09/2026)
   รางลอยคิดความกว้างตัวเองจากที่ว่างที่เหลือข้างเนื้อหา โดยเคยฝังเลขความกว้างหน้าไว้ตายตัว
   พอขยายหน้าเครื่องมือให้กว้างขึ้น เลขนั้นไม่ตรงอีกต่อไป รางจึงล้นไปทับแผงข้อมูล
   ข้อความถูกบังจนอ่านไม่ออก และมองไม่เห็นเลยถ้าไม่ได้เปิดที่ความกว้างจอพอดีช่วงนั้น

‼️ ข้อที่สองสำคัญไม่แพ้กัน
   กฎที่ซ่อนหัวเรื่องเดิม ผูกอยู่กับจุดที่รางเริ่มแสดง
   ถ้าย้ายจุดใดจุดหนึ่งโดยลืมอีกอัน จะมีช่วงความกว้างที่ไม่มีทั้งรางและหัวเรื่อง
   คือหน้าไม่มีชื่อเรื่องอะไรเลย ซึ่งเป็นของที่ไม่มีใครสังเกตจนกว่าจะมีคนทัก

‼️ ห้ามใช้ offsetParent ตัดสินว่า element ลอยแบบ fixed แสดงอยู่ไหม
   มันเป็นค่าว่างเสมอสำหรับ position:fixed ตัวตรวจรุ่นแรกของเทสนี้ผิดเพราะเรื่องนี้
   และรายงานว่า "รางไม่แสดง" ทั้งที่แสดงอยู่ชัด ๆ

รันปกติ:   FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_railfit.py
รันพิสูจน์: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_railfit.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")

# ‼️ ชุดนี้ตรวจ "โครงหน้าเครื่องมือรุ่นเดิม (v1)" ซึ่งยังอยู่ในเว็บและเปิดได้ด้วย ?ui=1
#    ค่าตั้งต้นของเว็บเปลี่ยนเป็น v2 ไปแล้วตั้งแต่ 21/09/2026 ชุดนี้จึงต้องประกาศให้ชัด
#    ว่าจะตรวจ v1 ไม่ใช่ปล่อยให้แดงค้างแล้วคิดว่า "เทสพัง" (ของจริงไม่ได้พัง มันคนละโครงกัน)
# ‼️ ตั้งผ่าน localStorage ไม่ใช่ต่อท้าย URL เพราะเว็บใช้ hash routing
#    (?ui=1 ต้องอยู่ก่อน # เสมอ ซึ่งพลาดง่ายเวลาประกอบ URL หลายที่ในไฟล์เดียว)
# ‼️ เมื่อพี่ปอนด์ยืนยันว่าเอา v2 แน่ แล้วโค้ด v1 ถูกลบ ให้ลบชุดนี้พร้อมกัน
V1_INIT = "try{localStorage.setItem('fk:ui','1')}catch(e){}"

WIDTHS = [2200, 1920, 1860, 1820, 1780, 1700, 1600, 1560, 1500, 1440, 1366, 1280, 1100]
TOOLS = ["pbi-bar", "map-coverage", "pdf-merge"]
MIN_RAIL = 150     # รางแคบกว่านี้อ่านไม่ออก มีก็เหมือนไม่มี

JS = """() => {
  const rail = document.querySelector('.tool-rail');
  const head = document.querySelector('.tool-head');
  const left = document.querySelector('.ws-left') || document.querySelector('.ws-grid');
  const vis = (n) => {
    if (!n) return false;
    const cs = getComputedStyle(n);
    return cs.display !== 'none' && cs.visibility !== 'hidden'
           && n.getBoundingClientRect().width > 0;
  };
  const r = rail ? rail.getBoundingClientRect() : null;
  const l = left ? left.getBoundingClientRect() : null;
  return {
    railShown: vis(rail), headShown: vis(head),
    railW: r ? Math.round(r.width) : 0,
    overlap: (r && l) ? Math.round(r.right - l.left) : -999,
  };
}"""


def run(selftest=False):
    fails, checked = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for t in TOOLS:
            for w in WIDTHS:
                ctx = b.new_context(viewport={"width": w, "height": 1000})
                pg = ctx.new_page()
                pg.add_init_script(V1_INIT)
                pg.goto(f"{BASE}/#/{t}", wait_until="load", timeout=60000)
                pg.wait_for_timeout(900)
                if selftest:
                    # ‼️ จำลองบั๊กเดิม ฝังความกว้างผิดให้ราง แล้วเทสต้องจับได้
                    pg.evaluate("""() => {
                      const r = document.querySelector('.tool-rail');
                      if (r) { r.style.display = 'block'; r.style.position = 'fixed';
                               r.style.insetInlineStart = '24px'; r.style.width = '520px'; }
                      const h = document.querySelector('.tool-head');
                      if (h) h.style.display = 'none';
                    }""")
                    pg.wait_for_timeout(150)
                m = pg.evaluate(JS)
                checked += 1
                if m["railShown"] and m["overlap"] > 0:
                    fails.append(f"{t} @{w}px: รางลอยทับเนื้อหา {m['overlap']}px")
                if m["railShown"] and m["railW"] < MIN_RAIL:
                    fails.append(f"{t} @{w}px: รางกว้างแค่ {m['railW']}px แคบจนอ่านไม่ออก")
                if not m["railShown"] and not m["headShown"]:
                    fails.append(f"{t} @{w}px: ไม่มีทั้งรางและหัวเรื่อง หน้าไม่มีชื่อเรื่องเลย")
                ctx.close()
        b.close()
    print(f"ตรวจ {len(TOOLS)} เครื่องมือ × {len(WIDTHS)} ความกว้าง = {checked} กรณี")
    seen = []
    for f in fails:
        if f not in seen:
            seen.append(f)
            print("  ❌", f)
    if not fails:
        print("  ✅ ผ่านทุกความกว้าง")
    return 1 if fails else 0


if __name__ == "__main__":
    st = "--selftest" in sys.argv
    code = run(st)
    if st:
        print("\nโหมดพิสูจน์:", "✅ เทสจับของพังได้จริง" if code else "🔴 เทสไม่จับอะไรเลย ใช้ไม่ได้")
        sys.exit(0 if code else 1)
    sys.exit(code)
