"""การ์ด หัวกราฟเล่าเรื่อง ใน pbi-bar ต้องแสดงและคัดลอกสูตรที่ตรงกับไฟล์ที่พิสูจน์แล้วทุกตัวอักษร

‼️ ที่มา 28/10/2026: สูตร measure หัวกราฟพิสูจน์ใน Power BI Desktop แล้ว 21 เคส
   (หลักฐาน .claude/evidence/2026-10-28-dax-headline) เก็บไว้ที่เดียวคือ samples/powerbi/headline-title.dax
   การ์ดดึงไฟล์นั้นมาแสดง ถ้าวันหนึ่งมีคนคัดสูตรไปฝังในโค้ดแล้วแก้คนละที่ เทสนี้จะแดง
ข้อประชากร: ต้องเจอการ์ดนี้ 1 ใบ และไฟล์สูตรต้องมีบรรทัด หัวกราฟ =

รัน: python3 -m http.server 8899 &  แล้ว ../.venv/bin/python tests/browser_headline_dax.py
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8899")
DAX = (ROOT / "samples/powerbi/headline-title.dax").read_text(encoding="utf-8")
fails = []


def ck(label, cond, detail=""):
    print(("  ✅ " if cond else "  ❌ ") + label)
    if not cond:
        if detail:
            print("      " + detail)
        fails.append(label)


def main():
    ck("ประชากร ไฟล์สูตรมีบรรทัด หัวกราฟ =", "\nหัวกราฟ =\n" in DAX)
    with sync_playwright() as P:
        b = P.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        pg = ctx.new_page()
        pg.goto(f"{BASE}/#/pbi-bar", wait_until="networkidle")
        pg.wait_for_selector(".pbib-learn", timeout=30000)
        pg.evaluate("document.querySelector('.pbib-learn').open = true")
        cards = pg.locator(".pbib-m").filter(has_text="หัวกราฟเล่าเรื่อง")
        ck("ประชากร เจอการ์ดหัวกราฟ 1 ใบ", cards.count() == 1, f"เจอ {cards.count()}")
        if cards.count() == 1:
            card = cards.first
            pg.wait_for_function("(el) => !el.textContent.includes('กำลังโหลดสูตร')",
                                 arg=card.locator("code").element_handle(), timeout=15000)
            shown = card.locator("code").text_content()
            ck("สูตรที่แสดงตรงกับไฟล์ทุกตัวอักษร", shown == DAX, f"ยาว {len(shown)} ไฟล์ {len(DAX)}")
            card.get_by_role("button", name="คัดลอก").click()
            pg.wait_for_timeout(300)
            got = pg.evaluate("navigator.clipboard.readText()")
            ck("ปุ่มคัดลอกได้สูตรเดียวกับไฟล์", got == DAX, f"ยาว {len(got)}")
        b.close()
    print(f"\nไม่ผ่าน {len(fails)}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
