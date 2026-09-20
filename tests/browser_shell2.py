#!/usr/bin/env python3
"""โครงหน้าเครื่องมือ v2 ต้องถูกต้องครบทุกเครื่องมือ ทุกสถานะ ทุกขนาดจอ

‼️ ทำไมต้องมีเทสนี้
   v2 เปลี่ยนผังของทั้ง 53 เครื่องมือพร้อมกันด้วยโค้ดกลางไฟล์เดียว
   ข้อดีคือแก้ที่เดียวได้ทั้งเว็บ ข้อเสียคือพังที่เดียวก็พังทั้งเว็บเหมือนกัน
   จึงต้องมีด่านที่ถามคำถามของผู้ใช้ตรง ๆ กับทุกเครื่องมือ ไม่ใช่สุ่มดูบางตัว

‼️ สิ่งที่เทสนี้จับได้ และเทสเดิม 108 ไฟล์จับไม่ได้
   ① เปิดเครื่องมือมาแล้วมีที่ให้เริ่มงานไหม (ปุ่มยักษ์ หรือสถานะทำงานที่พร้อมใช้)
   ② ใส่ไฟล์แล้วสถานะเปลี่ยนจริงไหม
   ③ ปุ่มลงมือทำอยู่ในจอไหม ไม่ใช่แค่ "มีอยู่ใน DOM"
   ④ ลูกล้นแม่ไหม (กับดัก grid/flex ที่ไม่มีอะไรฟ้องเลยนอกจากวัดเอง)
   ⑤ งานเริ่มใต้แถบหัวทันทีไหม

รันปกติ:   FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_shell2.py
รันเร็ว:   ... tests/browser_shell2.py --quick
รันพิสูจน์: ... tests/browser_shell2.py --selftest
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
FIX = Path(__file__).parent / "fixtures"
QUICK = ["pdf-pages", "pdf-merge", "pdf-watermark", "pdf-sign", "pbi-donut",
         "thai-number", "word-clean", "excel-csv", "image-resize", "pq-to-date"]

TOOL_IDS = """async (base) => (await import(base + '/src/registry.js')).TOOLS.map(t => t.id)"""

PROBE = """() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const inView = (e) => { const r = e.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= innerHeight + 1; };
  const s2 = document.querySelector('.s2');
  if (!s2) return { noShell: true };
  /* ‼️ v2 ใช้แถบหัวของเว็บเป็นแถบหัวของหน้าเครื่องมือ ไม่ได้สร้างแถบที่สอง
     (เดิมสร้างใหม่แล้วปุ่มธีมกับภาษาหายทุกเครื่องมือยกเว้นตัวแรก เพราะแอปแคช DOM ไว้) */
  const hd = document.querySelector('header.top');
  const land = document.querySelector('.s2-land');
  const work = document.querySelector('.s2-work');
  const state = s2.dataset.state;
  // พื้นที่ที่ผู้ใช้ทำงานจริงในสถานะนี้
  const area = state === 'landing' ? land : document.querySelector('.s2-canvas');
  const cta = [...document.querySelectorAll('.s2-cta, .s2-cta-big')].filter(vis)[0] || null;
  // ลูกล้นแม่ไหม
  const overflow = [...document.querySelectorAll('.s2-canvas, .s2-side')]
    .filter(vis)
    .map((e) => Math.round(e.getBoundingClientRect().bottom - e.parentElement.getBoundingClientRect().bottom))
    .filter((n) => n > 2);
  /* ‼️ ไม่นับของที่อยู่ใน subtree ที่ถูกสั่ง inert เพราะมันกดไม่ได้และ Tab ไม่ถึงจริง ๆ
     (หน้าเปล่าเป็นชั้นลอยทับ ของข้างหลังยังอยู่ใน DOM แต่ถูกปิดการใช้งานไว้) */
  const clickable = [...document.querySelectorAll('a,button,input:not([type=hidden]),select,textarea,[role=button]')]
    .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
             && r.bottom > 0 && r.top < innerHeight && !e.closest('[inert]'); });
  return {
    state, hasPicker: !!document.querySelector('.dz-wrap'),
    ctaText: cta ? (cta.textContent || '').trim().slice(0, 24) : null,
    ctaBox: cta ? [Math.round(cta.getBoundingClientRect().width), Math.round(cta.getBoundingClientRect().height)] : null,
    ctaInView: cta ? inView(cta) : null,
    workTop: (area && hd) ? Math.round(area.getBoundingClientRect().top - hd.getBoundingClientRect().bottom) : null,
    overflow, clickable: clickable.length,
    headerH: hd ? Math.round(hd.getBoundingClientRect().height) : 0,
    hasLangTheme: !!(document.querySelector('header.top #lang') && document.querySelector('header.top #theme')
                     && vis(document.querySelector('header.top #lang'))),
    hasMenuBtn: (() => { const b = document.getElementById('toolmenu'); return !!(b && vis(b)); })(),
  };
}"""

# งบของที่กดได้ต่อสถานะ (ดูแผนข้อ 3.7) — กว้างพอสำหรับเครื่องมือที่มีการ์ดหลายใบ
BUDGET = {"landing": 26, "work": 66, "result": 34}
# เครื่องมือที่ไม่มีปุ่มลงมือทำเพียงปุ่มเดียวโดยธรรมชาติ (ต้องมีเหตุผลกำกับทุกตัว)
NO_SINGLE_CTA = {"freebies"}   # หน้าแจกของ ปุ่มดาวน์โหลดอยู่ในการ์ดแต่ละใบ
# เครื่องมือที่หนาแน่นกว่าปกติโดยธรรมชาติ ยกเว้นรายตัวพร้อมเหตุผล
# ดีกว่าขยับงบทั้งชุด เพราะถ้าขยับทั้งชุด เครื่องมืออื่นจะค่อย ๆ โตตามโดยไม่มีใครทัก
DENSE = {"pbi-theme": 70}      # ตัวสร้างธีม: จานสี 8 ช่อง คูณหลายชุด บวกสวิตช์ของพรีวิว


def check(fails, ok, label, detail=""):
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))


def run(tools, selftest=False):
    fails, checked = [], 0
    pdf = FIX / "sample-3pages.pdf"
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        for vname, vp in [("เดสก์ท็อป 1600", {"width": 1600, "height": 900}),
                          ("โน้ตบุ๊ก 1366", {"width": 1366, "height": 768}),
                          ("มือถือ 390", {"width": 390, "height": 844})]:
            ctx = b.new_context(viewport=vp, locale="th-TH")
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
            for tid in tools:
                pg.goto(f"{BASE}/#/{tid}", wait_until="load", timeout=60000)
                try:
                    pg.wait_for_selector(".s2", timeout=15000)
                except Exception:
                    pass
                pg.wait_for_timeout(700)
                if selftest:
                    # ‼️ จำลองของพังสามอย่างที่เทสนี้ต้องจับได้
                    pg.evaluate("""() => {
                      const c = document.querySelector('.s2-canvas'); if (c) c.style.height = '3000px';
                      const f = document.querySelector('.s2-side-ft'); if (f) f.style.display = 'none';
                      const h = document.querySelector('.s2-hd'); if (h) h.style.marginBottom = '300px';
                    }""")
                    pg.wait_for_timeout(120)
                m = pg.evaluate(PROBE)
                checked += 1
                if m.get("noShell"):
                    fails.append(f"{tid} @{vname}: ไม่มีโครง v2 เลย")
                    continue
                st = m["state"]
                check(fails, m["headerH"] in range(55, 66), f"{tid} @{vname}: แถบหัวต้องสูง 60px", str(m["headerH"]))
                check(fails, m["workTop"] is not None and abs(m["workTop"]) <= 2,
                      f"{tid} @{vname}: งานต้องเริ่มใต้แถบหัวทันที", f"ห่าง {m['workTop']}px")
                check(fails, not m["overflow"], f"{tid} @{vname}: มีลูกล้นแม่", str(m["overflow"]))
                budget = DENSE.get(tid, BUDGET.get(st, 66))
                check(fails, m["clickable"] <= budget,
                      f"{tid} @{vname} [{st}]: ของกดได้เกินงบ", f"{m['clickable']} > {budget}")
                # เครื่องมือที่รับไฟล์ ต้องมีปุ่มยักษ์ให้เริ่ม · ที่ไม่รับไฟล์ ต้องเข้าสถานะทำงานเลย
                if m["hasPicker"]:
                    check(fails, st == "landing", f"{tid} @{vname}: เครื่องมือที่รับไฟล์ต้องเริ่มที่หน้าเปล่า", st)
                else:
                    check(fails, st == "work", f"{tid} @{vname}: เครื่องมือที่ไม่รับไฟล์ต้องเข้าสถานะทำงานเลย", st)
                # ยกเว้นเฉพาะเครื่องมือที่ไม่มีปุ่มลงมือทำเดียวโดยธรรมชาติจริง ๆ
                # freebies คือหน้าแจกของ ปุ่มดาวน์โหลดอยู่ในการ์ดแต่ละใบ การบังคับให้มีปุ่มเดียว
                # จะเป็นการยัดของที่ไม่มีความหมายเข้าไป ยกเว้นทีละตัวพร้อมเหตุผล ไม่ผ่อนเกณฑ์ทั้งชุด
                if tid not in NO_SINGLE_CTA:
                    check(fails, m["ctaText"] is not None, f"{tid} @{vname} [{st}]: ต้องมีปุ่มลงมือทำที่มองเห็น")
                if m["ctaBox"] and tid not in NO_SINGLE_CTA:
                    tall = 56 if vp["width"] < 861 else 64
                    check(fails, m["ctaBox"][1] >= tall,
                          f"{tid} @{vname}: ปุ่มหลักเตี้ยไป", f"{m['ctaBox']} ต้องสูง >= {tall}")
                    check(fails, m["ctaInView"], f"{tid} @{vname}: ปุ่มหลักหลุดจอ")
                check(fails, m["hasLangTheme"], f"{tid} @{vname}: ปุ่มภาษากับธีมต้องอยู่ในแถบหัวและมองเห็นได้")
                check(fails, m["hasMenuBtn"], f"{tid} @{vname}: ต้องมีปุ่มเมนูรวมเครื่องมือในแถบหัว")
            if errs:
                fails.append(f"@{vname}: มี error หลุดออกมา {errs[:2]}")
            ctx.close()

        # ── ใส่ไฟล์จริงแล้วสถานะต้องเปลี่ยน (ทำเฉพาะตัวแทน เพราะช้า) ──
        if pdf.exists():
            ctx = b.new_context(viewport={"width": 1600, "height": 900}, locale="th-TH")
            pg = ctx.new_page()
            for tid in [t for t in tools if t in ("pdf-pages", "pdf-merge", "pdf-watermark", "pdf-to-images")]:
                pg.goto(f"{BASE}/#/{tid}", wait_until="load", timeout=60000)
                pg.wait_for_timeout(1500)
                put = False
                for i in range(pg.locator("input[type=file]").count()):
                    try:
                        pg.locator("input[type=file]").nth(i).set_input_files(str(pdf))
                        put = True
                        break
                    except Exception:
                        pass
                if not put:
                    fails.append(f"{tid}: ใส่ไฟล์ไม่ได้เลย")
                    continue
                pg.wait_for_timeout(2500)
                checked += 1
                m = pg.evaluate(PROBE)
                check(fails, m["state"] == "work", f"{tid}: ใส่ไฟล์แล้วต้องเข้าสถานะทำงาน", m["state"])
                check(fails, m["ctaInView"], f"{tid}: ใส่ไฟล์แล้วปุ่มหลักต้องยังอยู่ในจอ", str(m["ctaBox"]))
            ctx.close()
        b.close()

    print(f"ตรวจ {checked} กรณี ({len(tools)} เครื่องมือ)")
    seen = []
    for f in fails:
        if f not in seen:
            seen.append(f)
            print("  ❌", f)
    if not fails:
        print("  ✅ โครง v2 ถูกต้องครบทุกเครื่องมือ ทุกขนาดจอ")
    return 1 if fails else 0


if __name__ == "__main__":
    selftest = "--selftest" in sys.argv
    if "--quick" in sys.argv or selftest:
        tools = QUICK
    else:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True)
            pg = b.new_context().new_page()
            pg.goto(BASE + "/", wait_until="load", timeout=60000)
            tools = pg.evaluate(TOOL_IDS, BASE)
            b.close()
        print(f"อ่านทะเบียนได้ {len(tools)} เครื่องมือ")
    code = run(tools, selftest)
    if selftest:
        print("\nโหมดพิสูจน์:", "✅ เทสจับของพังได้จริง" if code else "🔴 เทสไม่จับอะไรเลย ใช้ไม่ได้")
        sys.exit(0 if code else 1)
    sys.exit(code)
