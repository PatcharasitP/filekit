# ตรวจ 3 เครื่องมือจัดหน้ากระดาษ: ครอบตัด, เปลี่ยนขนาด, หลายหน้าต่อแผ่นกับเล่มเล็ก
#
# ‼️ คำถามที่สำคัญที่สุดของกลุ่มนี้คือ **ข้อความต้องยังค้นหาได้**
#    เพราะทั้งสามทำงานด้วยการวางหน้าเดิมลงกระดาษใหม่ ถ้าใครเผลอไปเรนเดอร์เป็นภาพ
#    ผู้ใช้จะเสียความสามารถค้นหาไปเงียบ ๆ โดยที่หน้าตาไฟล์เหมือนเดิมทุกประการ
#    --selftest พิสูจน์ว่าตัวตรวจแยก "ไฟล์ข้อความ" กับ "ไฟล์ภาพ" ออกจากกันได้จริง

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_impose_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_pdf(path, n, size=(595, 842)):
    d = fitz.open()
    for i in range(n):
        p = d.new_page(width=size[0], height=size[1])
        p.insert_text((60, 120), f"PAGE-MARK-{i + 1}", fontname="helv", fontsize=22)
    d.save(str(path)); d.close()
    return path


def read(path):
    d = fitz.open(str(path))
    r = {"pages": d.page_count,
         "sizes": [(round(d[i].rect.width), round(d[i].rect.height)) for i in range(d.page_count)],
         "texts": [d[i].get_text() for i in range(d.page_count)],
         "crops": [tuple(round(v) for v in d[i].cropbox) for i in range(d.page_count)],
         "medias": [tuple(round(v) for v in d[i].mediabox) for i in range(d.page_count)]}
    d.close()
    return r


def marks_on(texts, i):
    """คืนเลขหน้าเดิมที่ปรากฏบนแผ่นที่ i เรียงตามที่เจอ"""
    import re
    return [int(m) for m in re.findall(r"PAGE-MARK-(\d+)", texts[i])]


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, timeout=30000):
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=8000)
    except Exception:
        loc = pg.locator(".s2-res-list .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def open_tool(pg, tool, src, wait_sel):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_selector(wait_sel, timeout=25000)
    pg.wait_for_timeout(900)


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        textual = make_pdf(FIX / "t.pdf", 2)
        a = read(textual)
        ok1 = ck("ไฟล์ข้อความ ต้องอ่านเครื่องหมายหน้าได้", marks_on(a["texts"], 0), [1])
        # ไฟล์ภาพ: เรนเดอร์หน้าเดิมเป็นภาพ ข้อความต้องหาย
        d = fitz.open(str(textual)); out = fitz.open()
        for i in range(d.page_count):
            pix = d[i].get_pixmap(dpi=110)
            p = out.new_page(width=d[i].rect.width, height=d[i].rect.height)
            p.insert_image(p.rect, pixmap=pix)
        imaged = FIX / "img.pdf"; out.save(str(imaged)); out.close(); d.close()
        b = read(imaged)
        ok2 = ck("ไฟล์ภาพ ต้องอ่านเครื่องหมายหน้าไม่ได้เลย", marks_on(b["texts"], 0), [],
                 "ถ้ายังอ่านได้ แปลว่าตัวตรวจแยกสองแบบไม่ออก")
        good = all([ok1, ok2])
        print("\n" + ("✅ ตัวตรวจใช้ได้ แยกไฟล์ข้อความกับไฟล์ภาพออกจากกันได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    a4 = make_pdf(FIX / "a4-8.pdf", 8)

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        # ── ① ครอบตัด ────────────────────────────────────────────────────
        print("\n── ① ครอบตัดขอบ")
        open_tool(pg, "pdf-crop", a4, ".cr-layer")
        box = pg.locator(".cr-layer").bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.1, box["y"] + box["height"] * 0.08)
        pg.mouse.down()
        pg.mouse.move(box["x"] + box["width"] * 0.9, box["y"] + box["height"] * 0.6, steps=5)
        pg.mouse.up()
        pg.wait_for_timeout(400)
        act(pg, "ครอบตัดแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out1 = dl_result(pg, DL / "cropped.pdf")
        r1 = read(out1)
        ck("จำนวนหน้าไม่เปลี่ยน", r1["pages"], 8)
        ck("กรอบแสดงผลต้องเล็กลงจริง", r1["crops"][0] != r1["medias"][0], True,
           "ถ้าเท่ากัน แปลว่าไม่ได้ครอบตัดอะไรเลย")
        cw = r1["crops"][0][2] - r1["crops"][0][0]
        ck("ความกว้างที่เหลือต้องราว 80% ของหน้าเดิม", 440 < cw < 520, True, f"ได้ {cw} พอยต์")
        ck("ข้อความต้องยังค้นได้", marks_on(r1["texts"], 0), [1])

        # ── ② เปลี่ยนขนาดกระดาษ ─────────────────────────────────────────
        print("\n── ② เปลี่ยนขนาดกระดาษเป็น Letter")
        open_tool(pg, "pdf-resize", a4, ".rs-stage")
        pg.locator(".s2-side-bd select").first.select_option("letter")
        pg.wait_for_timeout(400)
        act(pg, "เปลี่ยนขนาดแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out2 = dl_result(pg, DL / "letter.pdf")
        r2 = read(out2)
        ck("ทุกหน้าต้องเป็นขนาด Letter 612x792", set(r2["sizes"]), {(612, 792)})
        ck("จำนวนหน้าไม่เปลี่ยน", r2["pages"], 8)
        ck("ข้อความต้องยังค้นได้ ไม่ใช่กลายเป็นภาพ", marks_on(r2["texts"], 3), [4])

        # ── ③ หลายหน้าต่อแผ่น ───────────────────────────────────────────
        print("\n── ③ 4 หน้าต่อแผ่น")
        open_tool(pg, "pdf-nup", a4, ".nu-stage")
        pg.locator(".s2-side-bd select").first.select_option("4")
        pg.wait_for_timeout(400)
        act(pg, "จัดหน้าแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out3 = dl_result(pg, DL / "4up.pdf")
        r3 = read(out3)
        ck("8 หน้าต้องเหลือ 2 แผ่น", r3["pages"], 2)
        ck("แผ่นแรกต้องมีหน้า 1 ถึง 4 ครบ", sorted(marks_on(r3["texts"], 0)), [1, 2, 3, 4])
        ck("แผ่นที่สองต้องมีหน้า 5 ถึง 8 ครบ", sorted(marks_on(r3["texts"], 1)), [5, 6, 7, 8])

        # ── ④ หนังสือเล่มเล็ก ───────────────────────────────────────────
        print("\n── ④ หนังสือเล่มเล็ก พับครึ่งเย็บกลาง")
        open_tool(pg, "pdf-nup", a4, ".nu-stage")
        pg.locator(".s2-side-bd select").first.select_option("booklet")
        pg.wait_for_timeout(400)
        act(pg, "จัดหน้าแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out4 = dl_result(pg, DL / "booklet.pdf")
        r4 = read(out4)
        ck("8 หน้าต้องได้ 4 ด้าน (กระดาษ 2 แผ่น พิมพ์สองหน้า)", r4["pages"], 4)
        # ‼️ ลำดับที่พิสูจน์ไว้: front[8,1] back[2,7] front[6,3] back[4,5]
        ck("ด้านที่ 1 ต้องเป็นหน้า 8 กับ 1", sorted(marks_on(r4["texts"], 0)), [1, 8],
           "ลำดับนี้คือหัวใจของเล่มพับ ถ้าผิดจะพับแล้วอ่านไม่เรียง")
        ck("ด้านที่ 2 ต้องเป็นหน้า 2 กับ 7", sorted(marks_on(r4["texts"], 1)), [2, 7])
        ck("ด้านที่ 3 ต้องเป็นหน้า 6 กับ 3", sorted(marks_on(r4["texts"], 2)), [3, 6])
        ck("ด้านที่ 4 ต้องเป็นหน้า 4 กับ 5", sorted(marks_on(r4["texts"], 3)), [4, 5])
        ck("กระดาษต้องเป็นแนวนอน", r4["sizes"][0][0] > r4["sizes"][0][1], True)

        # ── ⑤ เล่มเล็กที่หน้าไม่ลงตัว ต้องเติมหน้าว่างให้ ────────────────
        print("\n── ⑤ เล่มเล็กจากไฟล์ 5 หน้า ต้องเติมให้ครบ 8")
        five = make_pdf(FIX / "five.pdf", 5)
        open_tool(pg, "pdf-nup", five, ".nu-stage")
        pg.locator(".s2-side-bd select").first.select_option("booklet")
        pg.wait_for_timeout(400)
        act(pg, "จัดหน้าแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out5 = dl_result(pg, DL / "booklet5.pdf")
        r5 = read(out5)
        ck("5 หน้าต้องได้ 4 ด้านเหมือนกัน (เติมหน้าว่าง 3 หน้า)", r5["pages"], 4)
        found = sorted(sum((marks_on(r5["texts"], i) for i in range(4)), []))
        ck("หน้าจริงทั้ง 5 ต้องอยู่ครบ ไม่หายไปไหน", found, [1, 2, 3, 4, 5])

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ จัดหน้าถูกต้องทั้งสามตัว และข้อความยังค้นหาได้ทุกกรณี")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
