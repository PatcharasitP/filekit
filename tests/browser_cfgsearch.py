#!/usr/bin/env python3
"""ช่องค้นหาในแผงตั้งค่า ต้องกรองได้จริงและ "ล้างแล้วของกลับมาเท่าเดิม" ทุกเครื่องมือที่มีช่องนี้

‼️ ที่มา: แผงตั้งค่าของเครื่องมือหนัก ๆ ยาวเกินหนึ่งจอ (วัดจริง 11/09/2026 กราฟโดนัทเลื่อน 3.15 เท่า)
   ทำไปแล้วสองตัว (กราฟแท่ง, กราฟโดนัท) 23/09/2026 ต่อเพิ่มอีก 5 ตัวที่แผงเขียนแบบ "แบน"
   (หัวข้อกับช่องเป็นพี่น้องกัน ไม่มีกล่องห่อกลุ่ม) ด้วย flatGroups ใน src/cfgsearch.js

‼️ บั๊กที่เทสนี้ต้องจับให้ได้ (เคยเกิดจริงกับกราฟโดนัท)
   ล้างคำค้นแล้วสั่ง "เปิดทุกช่อง" ทำให้ช่องที่เครื่องมือตั้งใจซ่อนไว้ตามเงื่อนไขโผล่ออกมาด้วย
   ก่อนค้น 15 ช่อง แต่หลังล้างกลับเป็น 18 ช่อง — จำนวนต้องเท่าเดิมเป๊ะ

รัน: FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_cfgsearch.py
--selftest: ตรวจว่าตัวตรวจจับ "ล้างแล้วของงอก" ได้จริง (ยิงคำสั่งเปิดทุกช่องเองแล้วต้องแดง)
"""
import os
import sys
import tempfile
from pathlib import Path

import openpyxl
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
SELFTEST = "--selftest" in sys.argv

# เครื่องมือ , คำที่ต้องเจอ (มีจริง "ในแผงตั้งค่า" ไม่ใช่แผงซ้าย) , คำที่ต้องไม่เจอเลย , ต้องใส่ไฟล์ก่อนไหม
# ‼️ เครื่องมือที่เริ่มจาก "หน้าเปล่า" (ต้องมีไฟล์ก่อน) แผงตั้งค่าจะถูกชั้นลอยคลุมอยู่
#    ผู้ใช้จริงก็กดไม่ได้ เทสจึงต้องใส่ไฟล์ให้ก่อน ไม่ใช่ยัดค่าลงช่องข้ามชั้นลอย
CASES = [
    ("pbi-donut",             "ขนาด",   "zzzxxx", False),
    ("pbi-bar",               "ป้าย",    "zzzxxx", False),
    ("number-bins",           "ป้าย",    "zzzxxx", True),
    ("map-relocate",          "สี",      "zzzxxx", True),
    ("pq-group-concat",       "คอลัมน์", "zzzxxx", False),
    ("pq-pick-date",          "ชั้น",    "zzzxxx", False),
    ("pq-multisource-lookup", "คอลัมน์", "zzzxxx", False),
]

TMP = Path(tempfile.gettempdir())


def make_xlsx(tid):
    """ไฟล์เล็ก ๆ ที่เครื่องมือนั้นรับได้จริง (number-bins ใช้ตัวเลข , map-relocate ใช้พิกัด)"""
    wb = openpyxl.Workbook()
    ws = wb.active
    if tid == "map-relocate":
        ws.append(["SITE", "LAT_OLD", "LON_OLD", "LAT_NEW", "LON_NEW"])
        for i in range(8):
            ws.append([f"S{i:03d}", 13.7 + i / 100, 100.5 + i / 100, 13.8 + i / 100, 100.6 + i / 100])
    else:
        ws.append(["SITE", "DISTANCE_KM"])
        for i in range(12):
            ws.append([f"S{i:03d}", i * 3.5])
    p = TMP / f"cfgsearch-{tid}.xlsx"
    wb.save(p)
    return p

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


# นับ "ของที่ตาเห็นจริง" ในแผงขวา ไม่ใช่จำนวนโหนดทั้งหมด
VISIBLE = """() => { const p = (document.querySelector('.cfs-input') || {}).closest ? document.querySelector('.cfs-input').closest('.s2-side-bd, .ws-right, .s2-side') : null;
  if (!p) return null;
  const seen = [];
  for (const n of p.querySelectorAll('*')) {
    if (n.closest('.cfs-wrap')) continue;
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && n.children.length === 0 && (n.textContent || '').trim()) seen.push(n.textContent.trim().slice(0, 40));
  }
  return seen; }"""


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        for tid, hit, miss, need_file in CASES:
            pg.goto(f"{BASE}/#/{tid}")
            if need_file:
                pg.wait_for_selector(".dz", timeout=25000)
                pg.locator(".dz input[type=file]").first.set_input_files(str(make_xlsx(tid)))
                pg.wait_for_timeout(2200)
            try:
                pg.wait_for_selector(".cfs-input", timeout=25000)
            except Exception:
                ck(f"{tid}: มีช่องค้นหาในแผงตั้งค่า", False, "ไม่เจอ .cfs-input")
                continue
            pg.wait_for_timeout(400)
            before = pg.evaluate(VISIBLE)
            ck(f"{tid}: มีช่องค้นหาในแผงตั้งค่า (เห็นข้อความในแผง {len(before)} ชิ้น)", before is not None and len(before) > 3)

            box = pg.locator(".cfs-input").first
            box.click()          # คลิกจริงก่อนพิมพ์ ถ้ามีชั้นลอยคลุมอยู่จะแดงตรงนี้ ไม่ใช่ผ่านหลอก
            box.fill(hit)
            pg.wait_for_timeout(350)
            after = pg.evaluate(VISIBLE)
            cnt = pg.locator(".cfs-count").first.inner_text()
            ck(f"{tid}: พิมพ์ “{hit}” แล้วแผงสั้นลงจริง ({len(before)} เหลือ {len(after)}) , สรุปว่า “{cnt}”",
               len(after) < len(before) and cnt.startswith("พบ"))

            box.fill(miss)
            pg.wait_for_timeout(350)
            none_txt = pg.locator(".cfs-count").first.inner_text()
            ck(f"{tid}: คำที่ไม่มีอยู่จริง ขึ้นข้อความบอก ไม่ใช่แผงว่างเปล่าเงียบ ๆ", "ไม่พบ" in none_txt, none_txt)

            if SELFTEST and tid == CASES[0][0]:
                # จำลองบั๊กเดิม: ล้างคำค้นแล้ว "เปิดทุกช่อง" — ตัวตรวจต้องเห็นว่าของงอก
                pg.evaluate("""() => { document.querySelector('.cfs-input').value = '';
                    document.querySelector('.cfs-input').dispatchEvent(new Event('input'));
                    const box = document.querySelector('.cfs-input').closest('.s2-side-bd, .ws-right, .s2-side');
                    for (const n of box.querySelectorAll('[hidden]')) n.hidden = false; }""")
                pg.wait_for_timeout(300)
                grown = pg.evaluate(VISIBLE)
                ck("ตัวตรวจจับได้ว่า “ล้างแล้วของงอกเกินเดิม”", len(grown) > len(before),
                   f"ก่อน {len(before)} หลังแกล้งเปิดหมด {len(grown)} (ต้องมากกว่า ไม่งั้นตัวตรวจนี้ไร้ความหมาย)")
                continue

            box.fill("")
            pg.wait_for_timeout(350)
            back = pg.evaluate(VISIBLE)
            ck(f"{tid}: ล้างคำค้นแล้วของกลับมาเท่าเดิมเป๊ะ ({len(before)} = {len(back)})",
               back == before, f"ต่างกัน {len(set(map(str, back)) ^ set(map(str, before)))} ชิ้น")
        b.close()
    return finish()


def finish():
    print("\n" + "━" * 60)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")
        return 1
    print("✅ ช่องค้นหาในแผงตั้งค่าใช้ได้จริงทุกเครื่องมือ และล้างแล้วไม่ทำของงอก")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
