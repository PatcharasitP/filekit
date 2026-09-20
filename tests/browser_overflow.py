# -*- coding: utf-8 -*-
"""ของในแผงต้องไม่ล้นออกนอกกรอบแผง ตรวจทุกเครื่องมือ

ที่มาของเทสนี้ (20/09/2026)
  ฟ้ากวาดสายตาดูภาพเครื่องมือทีละตัว แล้วเจอว่า pa-html-table
  มีปุ่ม ขึ้น ลง ลบ ของแต่ละคอลัมน์หลุดออกไปนอกแผงซ้ายทั้งสามใบ
  ปุ่มลบอยู่ที่ 325-347px ส่วนแผงจบที่ 312px คือ "อยู่นอกกรอบทั้งใบ"
  และแผงมี overflow:hidden ผู้ใช้จึงสลับลำดับและลบคอลัมน์ไม่ได้เลย
  สาเหตุคือกับดัก flexbox ที่เจอบ่อยที่สุด flex:1 ที่ไม่มี min-width:0

  ‼️ เทสทั้ง 78 ไฟล์เขียวหมดตอนที่บั๊กนี้อยู่บนหน้าจอ เพราะไม่มีข้อไหนถามคำถามนี้
  จึงเขียนเป็นด่านถาวรที่ถามกับทุกเครื่องมือ ไม่ใช่เฉพาะตัวที่เคยพัง
  ของแบบนี้เกิดใหม่ได้ทุกครั้งที่ใครเพิ่มปุ่มเข้าไปในแถวที่มีช่องพิมพ์อยู่แล้ว

รันพิสูจน์ว่าเทสจับได้จริง: ../.venv/bin/python tests/browser_overflow.py --selftest
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8848")
SELFTEST = "--selftest" in sys.argv
SLACK = 2          # ยอมให้เลยขอบได้ 2px เผื่อการปัดเศษของเบราว์เซอร์
WIDTHS = [1440, 390]

JS = """(slack) => {
  const out = [];
  for (const sel of ['.ws-left', '.ws-right']) {
    const pn = document.querySelector(sel);
    if (!pn) continue;
    const pb = pn.getBoundingClientRect();
    /* ‼️ ต้องเทียบกับ "กรอบที่ตัดของ" ไม่ใช่กรอบของลูกที่เลื่อนได้
       .ws-scroll เลื่อนแนวตั้งได้ ของที่อยู่ใต้ขอบล่างจึงไม่ใช่การล้น
       แต่แนวนอนไม่มีที่ให้ไป ล้นซ้ายขวา = ผู้ใช้กดไม่ถึงจริง */
    for (const e of pn.querySelectorAll('button, input, select, a')) {
      if (!e.offsetParent) continue;
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (r.right > pb.right + slack || r.left < pb.left - slack) {
        out.push(sel + ' ' + (e.className || e.tagName).toString().slice(0, 28)
                 + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']'
                 + ' นอกกรอบ [' + Math.round(pb.left) + ',' + Math.round(pb.right) + ']');
      }
    }
  }
  return out.slice(0, 3);
}"""


def main():
    ids = re.findall(r'\{\s*id:"([a-z0-9-]+)"',
                     open("src/registry.js", encoding="utf-8").read())
    bad = {}
    checked = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in WIDTHS:
            ctx = b.new_context(viewport={"width": w, "height": 950},
                                has_touch=(w <= 500))
            pg = ctx.new_page()
            for t in ids:
                pg.goto(f"{BASE}/#{t}", wait_until="load", timeout=60000)
                pg.wait_for_timeout(1800)
                if not pg.evaluate("() => !!document.querySelector('.ws-left, .ws-right')"):
                    continue
                checked += 1
                if SELFTEST and t == "pa-html-table":
                    # ‼️ จำลองกับดักเดิมกลับมา คือ flex item ที่หดไม่ลง
                    pg.add_style_tag(content=".pah-col-head input{min-width:170px !important}")
                    pg.wait_for_timeout(200)
                hit = pg.evaluate(JS, SLACK)
                if hit:
                    bad.setdefault(f"{t} @{w}px", hit)
            ctx.close()
        b.close()

    for k, v in bad.items():
        print(f"  ❌ {k}")
        for line in v:
            print(f"      {line}")
    n = len(bad)
    print(f"\nตรวจ {checked} หน้า (เครื่องมือที่มีแผงข้าง x {len(WIDTHS)} ความกว้าง)"
          f"  พบของล้นนอกกรอบ {n} หน้า")
    if not n:
        print("  ✅ ไม่มีปุ่มหรือช่องไหนหลุดออกนอกแผงเลย")
    if SELFTEST:
        want = {k for k in bad if k.startswith("pa-html-table")}
        good = bool(want) and set(bad) == want
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงตัวที่แกล้งให้พัง" if good else
              f"❌ จับไม่ตรง ได้ {sorted(bad)}")
        return 0 if good else 1
    return 1 if n else 0


if __name__ == "__main__":
    sys.exit(main())
