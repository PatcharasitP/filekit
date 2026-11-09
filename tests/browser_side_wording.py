#!/usr/bin/env python3
"""ข้อความแนะนำต้องตรงกับเลย์เอาต์ที่ผู้ใช้เห็น
จอแคบ (ไม่เกิน 860px) ตัวเลือกอยู่ในลิ้นชักปุ่ม "ตัวเลือก" ห้ามบอกว่า "ด้านขวา" และห้ามบอกให้ "คลิก"
จอกว้างมีแผงขวาจริง ข้อความ "ด้านขวา" ยังต้องเห็น

‼️ ที่มา 09/11/2026 เทสเตอร์มือถือ B4 (.claude/evidence/2026-11-09-tester-fk-mobile/REPORT_FINDINGS.txt)
   pdf-protect ขึ้น "พิมพ์รหัสในแผงด้านขวาก่อน" , pdf-pages ขึ้น "คลิกหน้าเพื่อเลือก ... พิมพ์ช่วงหน้าด้านขวา"
   ทั้งบน SE , iPhone 15 , Pixel 7 , Fold , iPad mini แนวตั้ง และ iPhone 15 แนวนอน 852px

ใช้: python3 -m http.server 8899 &  แล้ว FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_side_wording.py"""
import os
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
PDF = pathlib.Path(__file__).resolve().parents[1] / "samples" / "ตัวอย่าง-รายงานประจำเดือน.pdf"
ok = fail = 0


def ck(label, cond, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if detail else ""), flush=True)


def seen(pg):
    """ข้อความที่มองเห็นจริงในผืนงาน (innerText ไม่รวมของที่ display:none)"""
    return pg.evaluate("() => document.querySelector('.s2-stage')?.innerText || ''").replace("\n", " ")


VIEWS = [("iPhone SE แนวตั้ง", 375, 667, True), ("iPhone 15 แนวนอน", 852, 393, True),
         ("iPad mini แนวตั้ง", 744, 1133, True), ("จอคอม", 1280, 800, False)]


def main():
    assert PDF.exists(), f"ไม่มีไฟล์ตัวอย่าง {PDF}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h, narrow in VIEWS:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=narrow, has_touch=narrow, locale="th-TH")
            pg = ctx.new_page()
            for tool in ("pdf-protect", "pdf-pages"):
                fkui.open_tool(pg, tool, base=BASE)
                fkui.feed(pg, [PDF])
                pg.wait_for_timeout(1500)
                t = seen(pg)
                key = "รหัส" if tool == "pdf-protect" else "ลากเพื่อสลับ"
                ck(f"{name} {tool} มีข้อความแนะนำ", key in t, t[:120])
                if narrow:
                    ck(f"{name} {tool} ไม่บอกว่าด้านขวา", "ด้านขวา" not in t, t[:160])
                    ck(f"{name} {tool} บอกปุ่มตัวเลือก", "ตัวเลือก" in t, t[:160])
                    ck(f"{name} {tool} ไม่ใช้คำว่าคลิก", not re.search(r"คลิก", t), t[:160])
                else:
                    ck(f"{name} {tool} จอกว้างยังบอกด้านขวา", "ด้านขวา" in t, t[:160])
            ctx.close()
        b.close()
    print(f"สรุป: ผ่าน {ok} ตก {fail}", flush=True)
    sys.exit(1 if fail or ok == 0 else 0)


if __name__ == "__main__":
    main()
