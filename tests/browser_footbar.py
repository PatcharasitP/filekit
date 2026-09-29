#!/usr/bin/env python3
"""แถบปุ่มล่างจอบนมือถือ ต้องไม่กินพื้นที่จนบังงานของผู้ใช้ และทุกปุ่มต้องแตะได้

‼️ ทำไมต้องมีเทสนี้ (18/09/2026)
   วัดจริงบนจอ 390x844 แล้วพบว่าแถบปุ่มของบางเครื่องมือสูงถึง 362 พิกเซล
   คิดเป็น 43% ของจอ และแถบนี้ลอยค้างอยู่ตลอด ผู้ใช้จึงเห็นงานตัวเองไม่ถึงครึ่งจอ
   สาเหตุคือปุ่มเรียงด้วย flex-wrap ปุ่มละบรรทัด ยิ่งเครื่องมือมีปุ่มเยอะยิ่งสูง

‼️ เขียนใหม่ 29/09/2026 เพราะรุ่นเดิมตาบอดมาตั้งแต่ย้ายโครงหน้ารุ่น 2
   รุ่นเดิมหาแถบ .ws-footer ซึ่งไม่มีแล้ว จึงรายงาน "ตรวจแถบปุ่ม 0 เครื่องมือ ✅ ผ่านทุกข้อ"
   ระหว่างนั้นปัญหาที่มันถูกเขียนมาจับกลับมาจริง วัดได้ 29/09 กราฟโดนัทกับกราฟแท่ง 297px (35%)
   excel-to-pq 249px (30%) และปุ่มรองสูง 40px ใน 26 เครื่องมือ
   รุ่นนี้วัดแถบ .s2-side-ft ไล่ทุกเครื่องมือจากทะเบียนจริง และมีข้อประชากรไม่ว่าง

‼️ ข้อที่บังคับ (วัดหลังกดไฟล์ตัวอย่าง บนจอสัมผัส 390x844)
   ① แถบสูงไม่เกิน 26% ของจอ เกณฑ์มาจากของจริงของโครงหน้ารุ่น 2 ส่วนใหญ่อยู่ 201px (24%)
      แถบที่สูงเกินคือแถบที่โตตามจำนวนปุ่ม ซึ่งเป็นปัญหาเดิม
   ② ทุกปุ่มที่มองเห็นในแถบ สูงอย่างน้อย 44 พิกเซล ตามที่ Apple แนะนำ
   ③ ปุ่มที่พับไว้ กดปุ่ม "อีก N ปุ่ม" แล้วต้องโผล่ครบตามจำนวนที่บอก และแตะได้

รันปกติ:   FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_footbar.py
รันพิสูจน์: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_footbar.py --selftest
"""
import json
import os
import pathlib
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 390, 844
MAX_PCT = 26          # แถบกินจอได้ไม่เกินเท่านี้
MIN_TAP = 44          # ความสูงต่ำสุดของปุ่มที่แตะได้สบาย
MIN_TOOLS = 60        # ประชากรไม่ว่าง ทะเบียนมี 68 เครื่องมือ (29/09/2026)


def tool_ids():
    out = subprocess.run(["node", "--input-type=module", "-e",
                          'import {TOOLS} from "./src/registry.js"; console.log(JSON.stringify(TOOLS.map(t=>t.id)))'],
                         cwd=str(ROOT), capture_output=True, text=True, check=True).stdout
    return json.loads(out)


MEASURE = """() => {
  const f = document.querySelector('.s2-side-ft');
  if (!f || !f.checkVisibility()) return null;
  const vis = [...f.querySelectorAll('button')].filter(b => b.checkVisibility());
  const more = f.querySelector('.s2-more');
  return {
    h: Math.round(f.getBoundingClientRect().height),
    small: vis.map(b => ({ t: b.textContent.trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height) }))
              .filter(x => x.h < %d),
    more: more && more.checkVisibility() ? more.textContent.trim() : null,
    visible: vis.length,
  };
}""" % MIN_TAP


def run(selftest=False):
    fails, checked, folded = [], 0, 0
    tools = tool_ids()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": W, "height": H}, is_mobile=True, has_touch=True)
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th')}catch(e){}")
        pg = ctx.new_page()
        for t in tools:
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{t}", wait_until="load", timeout=60000)
            pg.wait_for_timeout(1200)
            s = pg.locator("button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง")
            if s.count():
                s.first.click()
                pg.wait_for_timeout(1500)
            if selftest:
                # ‼️ พิสูจน์ว่าเทสจับของพังได้จริง ถอดการพับและบีบปุ่มให้เตี้ย แล้วต้องแดง
                pg.add_style_tag(content=".s2-subrow .s2-subfold{display:inline-flex !important}"
                                         ".s2-more{display:none !important}.s2-sub.btn{height:30px !important;min-height:0 !important}")
                pg.wait_for_timeout(250)
            m = pg.evaluate(MEASURE)
            if m is None:
                continue
            checked += 1
            pct = round(m["h"] / H * 100)
            if pct > MAX_PCT:
                fails.append(f"{t}: แถบปุ่มสูง {m['h']}px = {pct}% ของจอ เกินเกณฑ์ {MAX_PCT}%")
            for x in m["small"]:
                fails.append(f"{t}: ปุ่ม '{x['t']}' สูงแค่ {x['h']}px ต่ำกว่าเกณฑ์ {MIN_TAP}px")
            if m["more"] and not selftest:
                folded += 1
                n = int(re.search(r"\d+", m["more"]).group())
                before = m["visible"]
                pg.locator(".s2-more").click()
                pg.wait_for_timeout(400)
                m2 = pg.evaluate(MEASURE)
                # กางแล้ว ปุ่มพับโผล่ครบ n ปุ่ม (ปุ่มพับยังอยู่ ใช้ซ่อนกลับ)
                if m2["visible"] - before != n:
                    fails.append(f"{t}: ปุ่มบอก '{m['more']}' แต่กางแล้วโผล่ {m2['visible'] - before} ปุ่ม")
                for x in m2["small"]:
                    fails.append(f"{t}: กางแล้วปุ่ม '{x['t']}' สูงแค่ {x['h']}px")
        b.close()
    print(f"ตรวจแถบปุ่ม {checked} เครื่องมือ บนจอ {W}x{H} (มีปุ่มพับ {folded} เครื่องมือ)")
    if checked < MIN_TOOLS:
        fails.append(f"ตรวจได้แค่ {checked} เครื่องมือ ต่ำกว่า {MIN_TOOLS} แปลว่าหาแถบปุ่มไม่เจอ ตัวตรวจตาบอด")
    for f in fails:
        print("  ❌", f)
    if not fails:
        print("  ✅ ผ่านทุกข้อ")
    return 1 if fails else 0


if __name__ == "__main__":
    st = "--selftest" in sys.argv
    code = run(st)
    if st:
        # โหมดพิสูจน์ ต้องแดง ถ้าเขียวแปลว่าเทสจับอะไรไม่ได้เลย
        print("\nโหมดพิสูจน์:", "✅ selftest: ถอดการพับและบีบปุ่มแล้วแดง" if code else "🔴 เทสไม่จับอะไรเลย ใช้ไม่ได้")
        sys.exit(0 if code else 1)
    sys.exit(code)
