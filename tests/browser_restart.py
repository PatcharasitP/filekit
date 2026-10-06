# ปุ่ม "เริ่มใหม่" มุมขวาบนของแผงตัวเลือก ต้องล้างไฟล์ทุกกล่องแล้วกลับไปหน้าเปล่าจริง
#
# ‼️ ที่มา 06/10/2026: พี่ปอนด์กดเริ่มใหม่ที่ excel-lookup แล้ว "ไม่เห็นมีอะไรเลย"
#    จับค่าจริงแล้ว: hardReset ใน shell2.js หาปุ่มลบไฟล์ด้วย .file-x กับ .files .x
#    แต่ปุ่มลบจริงในกล่องรับไฟล์คือ button.icon-btn.danger ตัวเลือกเจอ 0 ปุ่ม ไฟล์จึงค้างอยู่ทุกเครื่องมือ
#    เทสเดิม (browser_cancel) กดเริ่มใหม่แล้วใส่ไฟล์ซ้ำทันที จึงไม่เคยเห็นว่าไฟล์ไม่ได้ถูกล้าง
#
# ถ้าผิดจะรู้ได้ยังไง: ข้อประชากรยืนยันก่อนว่ามีไฟล์อยู่จริงและอยู่สถานะทำงาน แล้วหลังกดต้องเหลือ 0 ไฟล์ และกลับหน้าเปล่า
#
# รัน: tests/run.sh browser_restart
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fkui  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"
P, F = 0, []

# เครื่องมือ, ไฟล์ที่ใส่ต่อกล่อง (กล่องที่ 0, 1, ...)
CASES = [
    ("excel-lookup", [[FIX / "lookup-main.xlsx"], [FIX / "lookup-source.xlsx"]]),
    ("excel-match-sum", [[FIX / "lookup-main.xlsx"]]),
    ("pdf-split", [[FIX / "sample-3pages.pdf"]]),
    # กล่องเดียวหลายไฟล์: ปุ่มลบที่จับไว้ก่อนกดจะชี้เลขแถวเก่า ต้องลบครบทุกไฟล์
    ("excel-merge", [[FIX / "lookup-main.xlsx", FIX / "lookup-source.xlsx", FIX / "lookup-table.xlsx"]]),
]


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def rows(pg):
    return pg.evaluate("() => document.querySelectorAll('.dz-wrap .file-row').length")


def main():
    base = os.environ.get("FK_BASE") or "http://127.0.0.1:8899"
    errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1360, "height": 950})
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        for tool, boxes in CASES:
            print(f"\n── {tool} ──")
            fkui.open_tool(pg, tool, base)
            for i, files in enumerate(boxes):
                fkui.feed(pg, files, i)
            pg.wait_for_timeout(800)
            want = sum(len(f) for f in boxes)
            ck(f"{tool}: ก่อนกด มีไฟล์ {want} ไฟล์และอยู่สถานะทำงาน", [rows(pg), fkui.state(pg)], [want, "work"])
            if pg.locator("button.s2-restart:visible").count():
                pg.locator("button.s2-restart:visible").click()
            else:
                # เครื่องมือแบบแผงเดี่ยวซ่อนหัวแผงไว้ (ทางเข้าของผู้ใช้อยู่ที่แผงผลลัพธ์) ตรวจกลไกล้างไฟล์ตรง ๆ
                pg.evaluate("() => document.querySelector('button.s2-restart').click()")
            pg.wait_for_timeout(1000)
            ck(f"{tool}: กดเริ่มใหม่แล้วไฟล์ถูกล้างหมดและกลับหน้าเปล่า", [rows(pg), fkui.state(pg)], [0, "landing"])
        b.close()
    ck("ไม่มี error ในหน้า", errs, [])
    print(f"\n{'✅' if not F else '❌'} ผ่าน {P} ข้อ {'' if not F else f'ตก {len(F)} ข้อ'}")
    if F:
        print("\n" + "\n".join(F) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
