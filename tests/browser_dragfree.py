#!/usr/bin/env python3
"""ทุกอย่างที่ลากได้ ต้องทำได้โดยไม่ต้องลากด้วย (WCAG 2.5.7 Dragging Movements)

‼️ ที่มา 20/09/2026 ทำ deep research เรื่อง UX การวางลายเซ็นตามที่พี่ปอนด์สั่ง
   แล้วพบว่า `pdf-sign` วางลายเซ็นได้ทางเดียวคือคลิกบนหน้า และย้ายได้ทางเดียวคือลาก
   ไม่มี keydown ไม่มี tabindex ไม่มี aria สักบรรทัด
   = คนที่ใช้คีย์บอร์ดอย่างเดียว หรือมีข้อจำกัดการเคลื่อนไหว **เซ็นเอกสารไม่ได้เลย**
   และเทส a11y เดิม 47 ข้อไม่มีข้อไหนตรวจเรื่องการลาก จึงเขียวมาตลอดทั้งที่ตกจริง

‼️ WCAG 2.5.7 (AA ใน WCAG 2.2) พูดว่า ทุกฟังก์ชันที่ใช้การลาก
   ต้องมีวิธีทำแบบ single-pointer ที่ไม่ต้องลากด้วย ยกเว้นกรณีที่การลากเป็นสาระสำคัญจริง ๆ
   ปุ่มลูกศรขยับทีละก้าวเป็นทางที่ตรงที่สุด และยังแม่นกว่าการลากด้วย
   เพราะเปลี่ยนงานเล็งต่อเนื่องให้เป็นการขยับทีละสเต็ปที่ไม่มีทางพลาด

‼️ และพื้นที่จับต้องใหญ่กว่าภาพ (Apple HIG 44pt , Material 48dp , WCAG 2.5.8 ขั้นต่ำ 24px)
   ลายเซ็นจริงเป็นเส้นบางสูงไม่กี่สิบพิกเซล ถ้าพื้นที่จับเท่าภาพพอดีจะจับยากมาก

รันปกติ:   ../.venv/bin/python tests/browser_dragfree.py
รันพิสูจน์: ../.venv/bin/python tests/browser_dragfree.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8848")
SELFTEST = "--selftest" in sys.argv
MIN_TARGET = 44          # ขนาดพื้นที่จับต่ำสุด ตาม Apple HIG
ok = fail = 0
reds = []
MUST_FAIL = {"[pdf-sign] ขยับด้วยปุ่มลูกศรได้จริง"}


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def draw_signature(pg):
    """วาดลายเซ็นในแผ่นรอง (ขั้นนี้ยอมให้ใช้เมาส์ เพราะการวาดลายเซ็นคือการลากโดยสาระ)"""
    pad = pg.locator("canvas.sign-canvas").first
    bb = pad.bounding_box()
    pg.mouse.move(bb["x"] + 25, bb["y"] + bb["height"] / 2)
    pg.mouse.down()
    for i in range(1, 9):
        pg.mouse.move(bb["x"] + 25 + i * 18, bb["y"] + bb["height"] / 2 + (20 if i % 2 else -20))
    pg.mouse.up()
    pg.wait_for_timeout(500)
    pg.get_by_role("button", name="ใช้ลายเซ็น").first.click()
    pg.wait_for_timeout(600)


def check_sign(pg):
    pg.goto(f"{BASE}/#/pdf-sign", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2400)
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").first.click()
    pg.wait_for_timeout(3800)
    draw_signature(pg)

    btn = pg.get_by_role("button", name="วางกลางหน้า")
    ck("[pdf-sign] มีทางวางลายเซ็นโดยไม่ต้องคลิกบนหน้า", btn.count() == 1)
    if not btn.count():
        return
    btn.first.click()
    pg.wait_for_timeout(700)

    item = "() => document.querySelector('.sign-item')"
    ck("[pdf-sign] วางแล้วโฟกัสไปที่ลายเซ็นทันที",
       "sign-item" in (pg.evaluate("() => document.activeElement.className") or ""))
    lab = pg.evaluate("() => document.activeElement.getAttribute('aria-label')") or ""
    ck("[pdf-sign] บอกตำแหน่งให้โปรแกรมอ่านหน้าจอได้ยิน", "%" in lab, lab[:44])

    before = pg.evaluate(f"{item}.style.left")
    step = 1 if not SELFTEST else 0     # โหมดพิสูจน์ = ไม่กดลูกศรเลย ต้องแดง
    for _ in range(3 * step):
        pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(250)
    after = pg.evaluate(f"{item}.style.left")
    ck("[pdf-sign] ขยับด้วยปุ่มลูกศรได้จริง", before != after, f"{before} → {after}")

    small = pg.evaluate(f"{item}.style.left")
    pg.keyboard.press("Shift+ArrowRight")
    pg.wait_for_timeout(200)
    big = pg.evaluate(f"{item}.style.left")
    ck("[pdf-sign] Shift+ลูกศร ก้าวใหญ่กว่าปกติ",
       abs(float(big[:-1]) - float(small[:-1])) > 1.0, f"{small} → {big}")

    box = pg.evaluate("""() => { const i = document.querySelector('.sign-item');
        const r = i.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(i, '::before').top) || 0;
        return { h: Math.round(r.height), w: Math.round(r.width), grab: Math.round(-pad) }; }""")
    reach = box["h"] + box["grab"] * 2
    ck(f"[pdf-sign] พื้นที่จับสูงอย่างน้อย {MIN_TARGET}px", reach >= MIN_TARGET,
       f"ภาพสูง {box['h']} + ขอบ {box['grab']}×2 = {reach}px")

    pg.keyboard.press("Delete")
    pg.wait_for_timeout(500)
    ck("[pdf-sign] ลบด้วยปุ่ม Delete ได้",
       pg.evaluate("() => document.querySelectorAll('.sign-item').length") == 0)

    # ‼️ โหมดขนาดหน้า ค่าเริ่มต้นต้องเป็น "เต็มความกว้าง" ตามที่ทั้งวงการทำ
    #    (pdf.js , Smallpdf , iLovePDF , PDF24 , Sejda ไม่มีเจ้าไหน default เป็น fit-page)
    #    ถ้าใครเปลี่ยนกลับไปเป็นเห็นทั้งหน้า หน้าจะเล็กลง 27-40% ทันที
    size = "() => { const b = document.querySelector('.sign-page').getBoundingClientRect();" \
           " return [Math.round(b.width), Math.round(b.height)]; }"
    wide = pg.evaluate(size)
    pg.get_by_label("เห็นทั้งหน้า").check()
    pg.wait_for_timeout(600)
    page_fit = pg.evaluate(size)
    ck("[pdf-sign] ค่าเริ่มต้นคือเต็มความกว้าง และใหญ่กว่าเห็นทั้งหน้าจริง",
       wide[0] > page_fit[0] * 1.2, f"เต็มกว้าง {wide[0]} เทียบ เห็นทั้งหน้า {page_fit[0]}")
    pg.get_by_label("เต็มความกว้าง").check()
    pg.wait_for_timeout(500)


def check_edit(pg):
    """‼️ pdf-edit วางกล่องปิดทับและข้อความด้วยการลากเหมือนกัน ต้องมีทางเลือกเช่นกัน"""
    pg.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000)
    pg.wait_for_timeout(2400)
    try:
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").first.click()
        pg.wait_for_timeout(4500)
    except Exception:
        ck("[pdf-edit] เปิดไฟล์ตัวอย่างได้", False)
        return
    btn = pg.get_by_role("button", name="วางกลางหน้า")
    ck("[pdf-edit] มีทางวางกล่องโดยไม่ต้องลาก", btn.count() >= 1)
    if not btn.count():
        return
    # ‼️ ต้องกดวางจริงแล้วตรวจ ไม่ใช่ตรวจตอนยังไม่มีกล่อง ซึ่งจะผ่านแบบว่างเปล่า
    btn.first.click()
    pg.wait_for_timeout(800)
    n = pg.evaluate("() => document.querySelectorAll('.pe-box').length")
    ck("[pdf-edit] กดแล้วได้กล่องจริง", n >= 1, f"{n} กล่อง")
    if not n:
        return
    ck("[pdf-edit] วางแล้วโฟกัสไปที่กล่องทันที",
       "pe-box" in (pg.evaluate("() => document.activeElement.className") or ""))
    lab = pg.evaluate("() => document.activeElement.getAttribute('aria-label')") or ""
    ck("[pdf-edit] บอกตำแหน่งให้โปรแกรมอ่านหน้าจอได้ยิน", "%" in lab, lab[:44])
    before = pg.evaluate("() => document.querySelector('.pe-box').style.left")
    for _ in range(3):
        pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(300)
    after = pg.evaluate("() => document.querySelector('.pe-box').style.left")
    ck("[pdf-edit] ขยับด้วยปุ่มลูกศรได้จริง", before != after, f"{before} → {after}")
    w0 = pg.evaluate("() => document.querySelector('.pe-box').style.width")
    pg.keyboard.press("Alt+ArrowRight")
    pg.wait_for_timeout(300)
    w1 = pg.evaluate("() => document.querySelector('.pe-box').style.width")
    ck("[pdf-edit] Alt+ลูกศร ปรับขนาดกล่องได้ ไม่ต้องลากมุม", w0 != w1, f"{w0} → {w1}")
    pg.keyboard.press("Delete")
    pg.wait_for_timeout(500)
    ck("[pdf-edit] ลบด้วยปุ่ม Delete ได้",
       pg.evaluate("() => document.querySelectorAll('.pe-box').length") == 0)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        check_sign(pg)
        check_edit(pg)
        ck("ไม่มี error หลุดออกมา", not errs, errs[0] if errs else "")
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
