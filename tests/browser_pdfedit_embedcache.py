#!/usr/bin/env python3
"""แก้ไขและเซ็นบน PDF: ลายเซ็นเดียวกันวางหลายจุด ต้องฝังภาพลงไฟล์ครั้งเดียว ไม่ใช่ทุกจุด

ที่มา 19/11/2026 แผนรวมตัวแก้ไข (ข้อ U7) อ่านโค้ดเดิมแล้วพบว่า save() เรียก embedPng ทุกครั้งที่เจอลายเซ็น
สัญญาหลายหน้าที่เซ็นกำกับทุกหน้า ไฟล์จึงโตตามจำนวนจุดเซ็นทั้งที่เป็นภาพเดียวกัน
วัด: วางรูปเดียวกัน 1 จุด กับ 6 จุด (3 หน้า หน้าละ 2) นับภาพที่ฝังจริงในไฟล์ (xref ไม่ซ้ำ) และขนาดไฟล์
เกณฑ์: 6 จุดต้องมีภาพที่ฝัง 1 ตัว และไฟล์ใหญ่กว่าแบบ 1 จุดไม่เกิน 1.2 เท่า

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfedit_embedcache.py
"""
import os
import sys
import tempfile
from pathlib import Path

import fitz
from PIL import Image

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
bad = 0


def ck(cond, label, detail=""):
    global bad
    bad += 0 if cond else 1
    print(("  ✅ " if cond else "  ❌ ") + label + (f"  [{detail}]" if detail and not cond else ""))


def run(pg, src, logo, spots, out):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.set_input_files(".dz input[type=file]", [str(src)])
    pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
    pg.wait_for_timeout(800)
    # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
    pg.click(".pe-right button[data-mode=sign]")
    pg.locator(".pe-right input[type=file]").last.set_input_files(str(logo))
    pg.wait_for_timeout(800)
    for page, fx, fy in spots:
        pg.locator(".pe-thumb").nth(page).click()
        pg.wait_for_timeout(600)
        r = pg.query_selector(".pe-layer").bounding_box()
        pg.mouse.click(r["x"] + r["width"] * fx, r["y"] + r["height"] * fy)
        pg.wait_for_timeout(200)
    with pg.expect_download(timeout=60000) as dl:
        pg.locator("button.s2-cta:visible, .ws-footer button").filter(has_text="บันทึก").first.click()
        pg.wait_for_timeout(2500)
        pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
    dl.value.save_as(str(out))
    d = fitz.open(str(out))
    xrefs = {i[0] for p in d for i in p.get_images(full=True)}
    places = sum(len(p.get_image_info()) for p in d)
    d.close()
    return len(xrefs), places, out.stat().st_size


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_pecache_"))
    src, logo = tmp / "s.pdf", tmp / "logo.png"
    d = fitz.open()
    for i in range(3):
        d.new_page(width=595, height=842).insert_text((80, 100), f"Page {i + 1}", fontsize=14)
    d.save(src)
    # ภาพมีรายละเอียด ไม่ใช่สีพื้น ไม่งั้นบีบอัดเหลือนิดเดียวจนวัดขนาดไม่ออก
    im = Image.effect_noise((360, 140), 60).convert("RGB")
    im.save(logo)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 1700}, accept_downloads=True).new_page()
        one = run(pg, src, logo, [(0, 0.3, 0.3)], tmp / "one.pdf")
        six = run(pg, src, logo, [(p, x, 0.3 + 0.3 * k) for p in range(3) for k, x in enumerate((0.3, 0.7))], tmp / "six.pdf")
        b.close()
    print(f"      1 จุด: ภาพที่ฝัง {one[0]} วางไว้ {one[1]} ขนาด {one[2]} ไบต์")
    print(f"      6 จุด: ภาพที่ฝัง {six[0]} วางไว้ {six[1]} ขนาด {six[2]} ไบต์ ({six[2] / one[2]:.2f} เท่า)")
    ck(six[1] == 6, "วาง 6 จุด ไฟล์มีรูปครบ 6 ที่", str(six[1]))
    ck(six[0] == 1, f"รูปเดียวกัน 6 จุด ฝังลงไฟล์ครั้งเดียว (ได้ {six[0]} ตัว)", str(six[0]))
    ck(six[2] <= one[2] * 1.2, f"ไฟล์ 6 จุดใหญ่กว่า 1 จุดไม่เกิน 1.2 เท่า (ได้ {six[2] / one[2]:.2f})", f"{six[2] / one[2]:.2f}")
    print(f"\nตก {bad}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
