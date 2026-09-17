#!/usr/bin/env python3
"""แถบปุ่มล่างจอบนมือถือ ต้องไม่กินพื้นที่จนบังงานของผู้ใช้ และทุกปุ่มต้องแตะได้

‼️ ทำไมต้องมีเทสนี้ (18/09/2026)
   วัดจริงบนจอ 390x844 แล้วพบว่าแถบปุ่มของบางเครื่องมือสูงถึง 362 พิกเซล
   คิดเป็น 43% ของจอ และแถบนี้ลอยค้างอยู่ตลอด ผู้ใช้จึงเห็นงานตัวเองไม่ถึงครึ่งจอ
   ทั้งที่ปุ่มส่วนใหญ่เป็นปุ่มที่ยังไม่ถึงเวลากด
   สาเหตุคือปุ่มเรียงด้วย flex-wrap ปุ่มละบรรทัด ยิ่งเครื่องมือมีปุ่มเยอะยิ่งสูง
   ซึ่งจะกลับมาเกิดใหม่ทุกครั้งที่มีใครเพิ่มปุ่ม ถ้าไม่มีเครื่องจับ

‼️ สองข้อที่เทสนี้บังคับ
   ① แถบตอนย่อต้องไม่เกิน 22% ของความสูงจอ
      (เกณฑ์นี้มาจากของจริง ตอนนี้ตัวที่หนักสุดอยู่ที่ 16% ซึ่งเป็นเครื่องมือที่มีแค่ 2 ปุ่มจึงไม่พับ)
   ② ทุกปุ่มที่มองเห็น ต้องสูงอย่างน้อย 44 พิกเซล ตามที่ Apple แนะนำ
      แถบนี้คือที่ที่คนกดตอนงานเสร็จ กดพลาดคือเสียงานที่ทำมาทั้งหมด

รันปกติ:   FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_footbar.py
รันพิสูจน์: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_footbar.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
W, H = 390, 844
MAX_PCT = 22          # แถบตอนย่อกินจอได้ไม่เกินเท่านี้
MIN_TAP = 44          # ความสูงต่ำสุดของปุ่มที่แตะได้สบาย
TOOLS = ["pbi-donut", "pbi-bar", "pa-html-table", "map-coverage", "map-relocate",
         "excel-match-sum", "pbi-theme", "pa-html-mail"]

MEASURE = """() => {
  const f = document.querySelector('.ws-footer');
  if (!f) return null;
  const vis = [...f.querySelectorAll('button')].filter(b => b.offsetParent);
  return {
    h: Math.round(f.getBoundingClientRect().height),
    hasMore: !!f.querySelector('.ws-more'),
    small: vis.map(b => ({ t: b.textContent.trim().slice(0, 24),
                           h: Math.round(b.getBoundingClientRect().height) }))
              .filter(x => x.h < %d),
  };
}""" % MIN_TAP


def run(selftest=False):
    fails, checked = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": W, "height": H}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        for t in TOOLS:
            pg.goto(f"{BASE}/#/{t}", wait_until="load", timeout=60000)
            pg.wait_for_timeout(1400)
            if selftest:
                # ‼️ พิสูจน์ว่าเทสจับของพังได้จริง ด้วยการทำให้พังเองแล้วต้องแดง
                pg.evaluate("""() => {
                  const f = document.querySelector('.ws-footer');
                  if (f) { f.classList.remove('has-more', 'more-open');
                           f.style.display = 'flex'; f.style.flexWrap = 'wrap';
                           f.querySelectorAll('.ws-foot-extra').forEach(b => {
                             b.style.display = 'inline-flex'; b.style.minHeight = '30px'; }); }
                }""")
                pg.wait_for_timeout(250)
            m = pg.evaluate(MEASURE)
            if m is None:
                continue
            checked += 1
            pct = round(m["h"] / H * 100)
            if pct > MAX_PCT:
                fails.append(f"{t}: แถบปุ่มสูง {m['h']}px = {pct}% ของจอ เกินเกณฑ์ {MAX_PCT}%")
            for s in m["small"]:
                fails.append(f"{t}: ปุ่ม '{s['t']}' สูงแค่ {s['h']}px ต่ำกว่าเกณฑ์ {MIN_TAP}px")
            # ปุ่มที่พับไว้ต้องกางออกมาแล้วยังแตะได้
            if m["hasMore"] and not selftest:
                pg.locator(".ws-more").click()
                pg.wait_for_timeout(500)
                m2 = pg.evaluate(MEASURE)
                for s in m2["small"]:
                    fails.append(f"{t}: กางแล้วปุ่ม '{s['t']}' สูงแค่ {s['h']}px")
                if not [x for x in pg.evaluate(
                        "()=>[...document.querySelectorAll('.ws-foot-extra')].filter(b=>b.offsetParent)")]:
                    fails.append(f"{t}: กดปุ่มพับแล้วปุ่มที่ซ่อนไม่โผล่ออกมา")
        b.close()
    print(f"ตรวจแถบปุ่ม {checked} เครื่องมือ บนจอ {W}x{H}")
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
        print("\nโหมดพิสูจน์:", "✅ เทสจับของพังได้จริง" if code else "🔴 เทสไม่จับอะไรเลย ใช้ไม่ได้")
        sys.exit(0 if code else 1)
    sys.exit(code)
