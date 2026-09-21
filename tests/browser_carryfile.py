# -*- coding: utf-8 -*-
"""ทำงานต่อกันหลายเครื่องมือบนไฟล์เดียว โดยไม่ต้องเลือกไฟล์ใหม่ (เรื่องหน้าจอ)
‼️ คนละเรื่องกับ browser_chain.py ซึ่งเทสว่า "ไฟล์ผลลัพธ์ของตัวหนึ่งเปิดได้ในอีกตัวไหม"
   ไฟล์นี้เทสว่า "หน้าจอพาไฟล์ไปให้เองไหม" และ "มองเห็นทางเลือกครบไหม"

‼️ ที่มา 19/09/2026 พี่ปอนด์: "เครื่องมือเยอะมาก รวมกันได้ไหม ทำทีละเครื่องมือไม่สะดวก"
   วัดจริงก่อนแก้: เครื่องมือหนึ่งตัวทำงานต่อบนไฟล์เดิมได้เฉลี่ย 11 ตัว (หมวด PDF 15.3)
   แต่หน้าเครื่องมือเสนอให้แค่ 2.1 ตัว = มองไม่เห็น 86% ของทางเลือก
   ผู้ใช้จึงต้องกลับหน้าแรก หาเครื่องมือใหม่ แล้วเลือกไฟล์ซ้ำทุกครั้ง

‼️ บั๊กที่เจอระหว่างทำ และเป็นเหตุผลที่เทสนี้ต้องเดินหลายขั้น ไม่ใช่ขั้นเดียว
   ขั้นแรกใช้ได้เสมอ เพราะผู้ใช้ใส่ไฟล์เองตอนหน้าขึ้นอยู่แล้ว
   แต่ขั้นที่สองเป็นต้นไปพัง เพราะตัวเฝ้าของแถบถูกถอดทิ้งตั้งแต่แจ้งเตือนครั้งแรก
   (ตอนนั้นแถบยังไม่ถูกใส่ลงหน้า เลยถูกนับว่าตายแล้ว)
   **เทสที่เดินขั้นเดียวจะเขียวทั้งที่ของพัง**
"""
import pathlib
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

# ‼️ ต้องเคารพ FK_BASE เสมอ ไม่งั้นตัวรันกลางยิงพอร์ตหนึ่ง เทสไปยิงอีกพอร์ตหนึ่ง
#    แล้วขึ้น ERR_CONNECTION_REFUSED โดยที่ของจริงไม่ได้พังเลย (เจอ 21/09/2026)
import os
BASE = (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http")
        else os.environ.get("FK_BASE", "http://127.0.0.1:8899"))
ok, bad = [], []
def check(name, cond, got=""):
    (ok if cond else bad).append(name)
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({got})" if got else ""))

PDF = pathlib.Path(tempfile.gettempdir()) / "filekit-chain.pdf"
try:
    import fitz
    d = fitz.open()
    for i in range(3):
        pg = d.new_page()
        pg.insert_text((72, 120), f"page {i + 1}", fontsize=20)
    d.save(str(PDF))
    d.close()
except ImportError:
    print("  ⚠️  ข้ามเทสนี้ ต้องมี PyMuPDF")
    sys.exit(0)

STATE = """() => ({
  tool: location.hash.replace('#/', '').replace('#', ''),
  files: (document.querySelector('.files') || {}).textContent || '',
  cards: document.querySelectorAll('.next-card').length,
  carry: document.querySelectorAll('.next-carry').length,
})"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    try:
        pg.goto(f"{BASE}/#pdf-compress", wait_until="load", timeout=45000)
        pg.wait_for_timeout(2200)
        before = pg.evaluate(STATE)
        check("ยังไม่มีไฟล์ ก็ยังเสนอเครื่องมือที่มักใช้ต่อ", before["cards"] >= 1, f"{before['cards']} ใบ")
        check("ยังไม่มีไฟล์ ต้องไม่มีป้ายพาไฟล์", before["carry"] == 0, f"{before['carry']} ป้าย")

        pg.locator("input[type=file]").first.set_input_files(str(PDF))
        pg.wait_for_timeout(1800)
        after = pg.evaluate(STATE)
        # ‼️ ข้อนี้คือหัวใจ: ต้องเสนอ "ทุกตัวที่ใช้กับไฟล์นี้ได้" ไม่ใช่แค่ 2 ตัวที่จดไว้เอง
        check("ใส่ไฟล์แล้ว ต้องเสนอเครื่องมือเพิ่มขึ้นมาก", after["cards"] >= 10,
              f"{before['cards']} ใบ -> {after['cards']} ใบ")
        check("ทุกใบต้องมีป้ายพาไฟล์ไปด้วย", after["carry"] == after["cards"],
              f"{after['carry']} จาก {after['cards']}")
        check("ซ่อนที่เกินไว้ใต้ปุ่ม ไม่เทออกมาทั้งหมด",
              pg.evaluate("() => [...document.querySelectorAll('.next-card')].filter(x => x.offsetParent).length") <= 8,
              f"{pg.evaluate('() => [...document.querySelectorAll(\".next-card\")].filter(x => x.offsetParent).length')} ใบที่เห็น")
        check("มีปุ่มเปิดดูที่เหลือ",
              pg.evaluate("() => { const m = document.querySelector('.next-more'); return !!m && !m.hidden; }"))

        # ‼️ เดินหลายขั้น ขั้นแรกใช้ได้เสมอแม้ของพัง ต้องเดินถึงขั้นที่ 4 ถึงจะจับได้
        seen = []
        for step in range(2, 6):
            pg.wait_for_selector(".next-card", timeout=8000)
            pg.wait_for_timeout(700)
            pick = pg.evaluate("""() => { const c = [...document.querySelectorAll('.next-card')];
              const k = Math.min(3, c.length - 1);
              return {name: c[k].querySelector('.next-title').textContent, carry: !!c[k].querySelector('.next-carry')}; }""")
            pg.evaluate("""() => { const c = [...document.querySelectorAll('.next-card')];
              c[Math.min(3, c.length - 1)].click(); }""")
            pg.wait_for_timeout(2800)
            st = pg.evaluate(STATE)
            seen.append(f"{st['tool']}({st['cards']})")
            check(f"ขั้นที่ {step} ไฟล์ตามไปถึงเครื่องมือถัดไป", "filekit-chain.pdf" in st["files"],
                  f"ไป {st['tool']} ได้ไฟล์ {'มี' if st['files'] else 'ไม่มี'}")
            check(f"ขั้นที่ {step} ยังเสนอเครื่องมือครบเหมือนเดิม", st["cards"] >= 10,
                  f"{st['cards']} ใบ")
        print(f"      เส้นทางที่เดิน: {' -> '.join(seen)}")
        check("ไม่มี error หลุดออกมา", not errs, errs[0] if errs else "")
    except Exception as e:
        bad.append(f"เทสระเบิดกลางทาง: {str(e).splitlines()[0][:90]}")
        print(f"  ❌ เทสระเบิดกลางทาง {str(e).splitlines()[0][:90]}")
    b.close()

print(f"\nผ่าน {len(ok)} ตก {len(bad)}")
for x in bad:
    print(f"   ❌ {x}")
sys.exit(1 if bad else 0)
