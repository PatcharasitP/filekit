#!/usr/bin/env python3
"""ตัวเลขที่เว็บอ้างกับผู้ใช้ ต้องตรงกับความจริงเสมอ ไม่ใช่จริงแค่วันที่เขียน

‼️ ที่มา 20/09/2026 พี่ปอนด์ให้ไปศึกษา kob-ui.com
   สิ่งที่ถอดมาได้คือวินัยข้อเดียว ทุกคำอ้างของเขามีตัวเลขที่วัดจริงกำกับเสมอ
   "10,000 แถวเรียงใน 20 ms" , "551 kB gzipped" , "ทุกคู่สีผ่าน 4.5:1 ทั้ง 5 ธีม"
   ไม่ใช่คำว่า เร็ว เบา ปลอดภัย ลอย ๆ

‼️ แต่ตัวเลขบนหน้าเว็บอันตรายกว่าคำคุณศัพท์ ตรงที่มันผิดได้เงียบ ๆ
   เพิ่มเครื่องมือตัวที่ 54 แล้วลืมแก้เลข 53 = โกหกผู้ใช้โดยไม่มีใครรู้
   เทสนี้จึงไปนับของจริงมาเทียบทุกตัวเลขที่เราพิมพ์ไว้บนหน้าแรก

ตรวจ 4 อย่าง
   ① จำนวนเครื่องมือที่อ้าง ต้องเท่ากับจำนวนที่แสดงจริงบนหน้า
   ② จำนวนชุดทดสอบที่อ้าง ต้องเท่ากับไฟล์เทสที่มีอยู่จริง
   ③ เวลาเปิดหน้าแรกที่อ้าง ต้องไม่เร็วเกินกว่าที่วัดได้จริงบนเน็ตมือถือช้า
   ④ ทุกข้อความในส่วนนี้ต้องมีภาษาอังกฤษครบ และส่วนนี้ต้องอยู่ "ใต้" รายการเครื่องมือเสมอ

รันปกติ:   ../.venv/bin/python tests/browser_trust.py
รันพิสูจน์: ../.venv/bin/python tests/browser_trust.py --selftest
"""
import os
import pathlib
import re
import statistics
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent
ok = fail = 0
reds = []
MUST_FAIL = {"จำนวนเครื่องมือที่อ้างบนหน้า ตรงกับที่มีจริง"}

# สภาพเน็ตมือถือช้า ชุดเดียวกับ tests/browser_perf.py จะได้เทียบกันได้
NET = {"offline": False, "latency": 150,
       "downloadThroughput": int(1.6 * 1024 * 1024 / 8),
       "uploadThroughput": int(750 * 1024 / 8)}


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def main():
    # ‼️ 23/09/2026 ต้องนับให้ตรงกับ "ด่านจริงก่อนปล่อยของ" คือ tests/runp.sh all
    #    ซึ่ง = browser_*.py + css_contract.py + *.test.mjs + contract (เทสร่วมกับ FlowKit)
    #    เดิมนับแค่ browser_*.py จึงได้ 101 ทั้งที่ด่านจริงมี 126 ชุด = ตัวเลขบนหน้าเว็บต่ำกว่าความจริง
    #    (tests/readme.test.mjs ใช้สูตรเดียวกันนี้ แก้ที่ไหนต้องแก้ให้ตรงกันทั้งสองที่)
    real_tests = (len(list((ROOT / "tests").glob("browser_*.py")))
                  + len(list((ROOT / "tests").glob("*.test.mjs"))) + 2)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()
        pg.goto(f"{BASE}/", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2400)

        box = pg.locator(".trust")
        ck("หน้าแรกมีส่วน 'ตรวจเองได้'", box.count() == 1)
        if box.count() != 1:
            print("\nผ่าน %d ตก %d" % (ok, fail))
            return 1
        text = box.inner_text().replace("\n", " ")

        # ① จำนวนเครื่องมือ
        shown_tools = pg.evaluate("() => document.querySelectorAll('.pill').length")
        if SELFTEST:
            shown_tools += 1     # แกล้งให้ของจริงไม่ตรงกับที่พิมพ์ไว้ เทสต้องแดง
        claimed = [int(n) for n in re.findall(r"(\d+)\s*เครื่องมือ", text)]
        ck("จำนวนเครื่องมือที่อ้างบนหน้า ตรงกับที่มีจริง",
           bool(claimed) and all(c == shown_tools for c in claimed),
           f"อ้าง {claimed} มีจริง {shown_tools}")

        # ② จำนวนชุดทดสอบ
        claimed_tests = [int(n) for n in re.findall(r"(\d+)\s*ชุด", text)]
        ck("จำนวนชุดทดสอบที่อ้าง ตรงกับไฟล์เทสที่มีจริง",
           bool(claimed_tests) and all(c == real_tests for c in claimed_tests),
           f"อ้าง {claimed_tests} มีจริง {real_tests}")

        # ③ ขนาดไฟล์ออฟไลน์ที่อ้าง ต้องตรงกับปุ่มโหลดออฟไลน์ (แหล่งเดียวกันต้องพูดตรงกัน)
        bar = pg.locator(".offline-bar").inner_text() if pg.locator(".offline-bar").count() else ""
        mb_trust = re.findall(r"(\d+)\s*MB", text)
        mb_bar = re.findall(r"(\d+)\s*MB", bar)
        ck("ขนาดไฟล์ออฟไลน์ที่อ้าง ตรงกับที่ปุ่มโหลดออฟไลน์บอก",
           bool(mb_trust) and mb_trust == mb_bar, f"ในส่วนนี้ {mb_trust} ที่ปุ่ม {mb_bar}")

        # ④ ต้องอยู่ใต้รายการเครื่องมือ ห้ามดันเครื่องมือลงไป
        pos = pg.evaluate("""() => ({ tools: document.querySelector('#tools').getBoundingClientRect().bottom,
                                      trust: document.querySelector('.trust').getBoundingClientRect().top })""")
        ck("ส่วนนี้ต้องอยู่ใต้รายการเครื่องมือ ไม่ขวางคนที่มาหาเครื่องมือ",
           pos["trust"] >= pos["tools"] - 2, str(pos))

        # ‼️ ④.5 ต้องไม่โผล่บนหน้าเครื่องมือ (เพิ่มหลังทำพังเอง 20/09/2026)
        #    รอบแรกฟ้าวางส่วนนี้ไว้ "นอก" บล็อกหน้าแรก มันจึงค้างอยู่ทุกหน้า
        #    และไปอยู่ "เหนือ" ตัวเครื่องมือ ดันเนื้อหาลงไป 200px ทุกครั้งที่เปิดเครื่องมือ
        #    ตรวจไม่เจอด้วยตาเพราะบนหน้าแรกมันถูกต้องทุกอย่าง ต้องเปิดหน้าเครื่องมือถึงเห็น
        pg.goto(f"{BASE}/#/pdf-merge", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2400)
        leak = pg.evaluate("() => { const t = document.querySelector('.trust');"
                           " return !!(t && t.offsetParent); }")
        ck("‼️ ส่วนนี้ต้องไม่โผล่บนหน้าเครื่องมือ", not leak)
        pg.goto(f"{BASE}/", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2200)

        # ⑤ ภาษาอังกฤษต้องครบทุกข้อความ
        missing = pg.evaluate("""() => [...document.querySelectorAll('.trust b, .trust span, .trust h2, .trust p')]
            .filter(e => !e.getAttribute('data-en')).map(e => e.textContent.trim().slice(0, 28))""")
        ck("ทุกข้อความในส่วนนี้มีภาษาอังกฤษครบ", not missing, str(missing[:3]))
        ctx.close()

        # ⑥ เวลาเปิดหน้าแรกที่อ้าง ต้องไม่เร็วกว่าที่วัดได้จริง
        claimed_sec = re.findall(r"([\d.]+)\s*วินาที", text)
        budget_ms = float(claimed_sec[0]) * 1000 + 49 if claimed_sec else None   # 0.4 วินาที = ปัดได้ถึง 449 ms
        fcps = []
        for _ in range(3):
            c = b.new_context(viewport={"width": 390, "height": 780}, is_mobile=True, has_touch=True)
            pg2 = c.new_page()
            cdp = c.new_cdp_session(pg2)
            cdp.send("Network.enable")
            cdp.send("Network.emulateNetworkConditions", NET)
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            pg2.goto(f"{BASE}/", wait_until="load", timeout=90000)
            pg2.wait_for_timeout(900)
            v = pg2.evaluate("""() => { const e = performance.getEntriesByName('first-contentful-paint')[0];
                                        return e ? Math.round(e.startTime) : null; }""")
            if v:
                fcps.append(v)
            c.close()
        med = statistics.median(fcps) if fcps else None
        ck("เวลาเปิดหน้าแรกที่อ้าง ต้องไม่เร็วเกินกว่าที่วัดได้จริง",
           budget_ms is not None and med is not None and med <= budget_ms,
           f"อ้าง {claimed_sec[0] if claimed_sec else '?'} วินาที วัดได้ {med} ms จากทุกรอบ {fcps}")
        b.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        good = set(reds) == MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับไม่ตรง ขาด {MUST_FAIL - set(reds)} เกิน {set(reds) - MUST_FAIL}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
