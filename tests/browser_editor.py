# ตรวจ "ตัวแก้ไข PDF รวมร่าง" (เฟส 6 — 21/09/2026)
#
# เดิมงานวางของทับหน้า PDF แยกเป็นสองเครื่องมือ แก้ข้อความ กับ เซ็นชื่อ
# รอบนี้รวมเป็นตัวเดียวที่มี 5 เครื่องมือ ปิดทับ ข้อความ ไฮไลต์ ลายเซ็น รูป
#
# ‼️ คำถามที่ต้องพิสูจน์จากไฟล์ผลลัพธ์จริง ไม่ใช่จากหน้าจอ
#    ① ของทุกชนิดที่วาง ไปโผล่ในไฟล์จริง (ไม่ใช่เห็นแค่บนจอแล้วหายตอนบันทึก)
#    ② ‼️ ไฮไลต์ต้อง **โปร่ง** ข้อความใต้แถบต้องยังอ่านและค้นหาได้
#       ถ้าทึบ มันคือกล่องปิดทับที่เปลี่ยนสี ซึ่งตรงข้ามกับคำว่าไฮไลต์
#    ③ ปิดทับต้อง **ทึบ** จริง บังของที่อยู่ข้างใต้ให้มองไม่เห็น
#    ④ ลายเซ็นกับรูปต้องรักษาสัดส่วนเดิม ไม่แบนไม่ยืด
#    ⑤ ทำทั้ง 5 อย่างในรอบเดียวแล้วบันทึกครั้งเดียว ต้องได้ครบ (นี่คือเหตุผลที่รวมเครื่องมือ)

import sys, os, io, pathlib, tempfile, shutil, traceback
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_editor_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


# ── ตัวตรวจ อ่านจากไฟล์จริงล้วน ─────────────────────────────────────────────
def n_images(path, page=0):
    d = fitz.open(str(path)); n = len(d[page].get_images(full=True)); d.close(); return n


def text_of(path, page=0):
    d = fitz.open(str(path)); t = d[page].get_text(); d.close(); return t


def pixel(path, rx, ry, zoom=2):
    """สีของจุดหนึ่งบนหน้า (อ้างเป็นสัดส่วนของหน้า) คืนเป็น (r,g,b)"""
    d = fitz.open(str(path))
    pm = d[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    im = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
    d.close()
    return im.getpixel((int(pm.width * rx), int(pm.height * ry)))


def img_ratio(path, page=0):
    """สัดส่วน กว้าง/สูง ของภาพที่ถูกวางบนหน้า (จากกรอบที่วางจริง ไม่ใช่ขนาดไฟล์ภาพ)"""
    d = fitz.open(str(path))
    out = []
    for info in d[page].get_images(full=True):
        for r in d[page].get_image_rects(info[0]):
            if r.height > 0: out.append(round(r.width / r.height, 3))
    d.close()
    return out


def make_src(path):
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.insert_text((70, 120), "SIGN HERE", fontname="helv", fontsize=20)
    p.insert_text((70, 300), "HIGHLIGHT THIS LINE", fontname="helv", fontsize=18)
    p.insert_text((70, 500), "COVER THIS LINE", fontname="helv", fontsize=18)
    d.save(str(path)); d.close()
    return path


def make_logo(path, size=(240, 80)):
    """โลโก้สี่เหลี่ยมผืนผ้าชัด ๆ สัดส่วน 3:1 เอาไว้ตรวจว่าไม่ถูกยืด"""
    im = Image.new("RGB", size, (20, 110, 190))
    im.save(path)
    return path


# ── หน้าเว็บ ────────────────────────────────────────────────────────────────
def open_editor(pg, src):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-edit", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").first.set_input_files(str(src))
    pg.wait_for_selector(".pe-layer", timeout=30000)
    pg.wait_for_timeout(2500)


def mode(pg, name):
    pg.locator(f"[data-mode={name}]").first.click()
    pg.wait_for_timeout(300)


def drag(pg, x0, y0, x1, y1):
    """ลากคลุมบนชั้นวาด โดยอ้างตำแหน่งเป็นสัดส่วนของหน้า"""
    box = pg.locator(".pe-layer").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * x0, box["y"] + box["height"] * y0)
    pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * (x0 + x1) / 2, box["y"] + box["height"] * (y0 + y1) / 2, steps=5)
    pg.mouse.move(box["x"] + box["width"] * x1, box["y"] + box["height"] * y1, steps=5)
    pg.mouse.up()
    pg.wait_for_timeout(400)


def click_at(pg, x, y):
    box = pg.locator(".pe-layer").bounding_box()
    pg.mouse.click(box["x"] + box["width"] * x, box["y"] + box["height"] * y)
    pg.wait_for_timeout(400)


def draw_signature(pg):
    """วาดลายเซ็นในกระดานแล้วกดใช้"""
    pad = pg.locator(".pe-sign canvas").first
    # ‼️ แผงขวาสูงกว่าจอ กระดานวาดจึงอยู่ใต้เส้นพับ ถ้าไม่เลื่อนให้เห็นก่อน
    #    การลากเมาส์จะไปตกนอกกระดาน ปุ่ม "ใช้ลายเซ็นนี้" เลยไม่เคยเปิด
    pad.scroll_into_view_if_needed()
    pg.wait_for_timeout(300)
    b = pad.bounding_box()
    pg.mouse.move(b["x"] + b["width"] * 0.15, b["y"] + b["height"] * 0.7)
    pg.mouse.down()
    for fx, fy in [(0.3, 0.25), (0.45, 0.75), (0.6, 0.3), (0.8, 0.6)]:
        pg.mouse.move(b["x"] + b["width"] * fx, b["y"] + b["height"] * fy, steps=4)
    pg.mouse.up()
    pg.wait_for_timeout(300)
    pg.locator("button:visible").filter(has_text="ใช้ลายเซ็นนี้").first.click()
    pg.wait_for_timeout(600)


def save_as(pg, out):
    pg.locator("button.s2-cta:visible, button.btn:visible").filter(has_text="บันทึก").first.click()
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible, .results .result button:visible") \
            .filter(has_text="ดาวน์โหลด")
    loc.first.wait_for(state="visible", timeout=60000)
    with pg.expect_download() as dl:
        loc.first.click()
    dl.value.save_as(str(out))
    return out


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    src = make_src(FIX / "doc.pdf")
    logo = make_logo(FIX / "logo.png")

    if SELFTEST:
        # ‼️ พิสูจน์ว่าตัวตรวจแยก "ทึบ" ออกจาก "โปร่ง" ได้จริง และนับภาพได้จริง
        print("ตรวจตัวตรวจเอง")
        d = fitz.open(str(src))
        pg1 = d[0]
        pg1.draw_rect(fitz.Rect(60, 480, 300, 510), color=None, fill=(1, 1, 1), fill_opacity=1)     # ทึบ
        pg1.draw_rect(fitz.Rect(60, 280, 300, 310), color=None, fill=(1, 0.88, 0.3), fill_opacity=0.38)  # โปร่ง
        probe = FIX / "probe.pdf"; d.save(str(probe)); d.close()

        solid = pixel(probe, 0.30, 0.575)
        trans = pixel(probe, 0.30, 0.340)
        ok1 = ck("จุดใต้กล่องทึบต้องเป็นสีของกล่อง (ขาว) ไม่ใช่สีหมึก", solid[0] > 240 and solid[2] > 240, True,
                 f"อ่านได้ {solid}")
        ok2 = ck("จุดใต้แถบโปร่งต้องเป็นสีเหลือง ไม่ใช่ขาว", trans[2] < 210 and trans[0] > 200, True,
                 f"อ่านได้ {trans} (ถ้าเป็นขาวแปลว่าตัวตรวจแยกโปร่งกับทึบไม่ออก)")
        ok3 = ck("ไฟล์ต้นทางต้องยังไม่มีภาพฝังอยู่เลย (ประชากรเริ่มที่ศูนย์)", n_images(src), 0)
        ok4 = ck("ตัวอ่านข้อความต้องอ่านบรรทัดในไฟล์ต้นทางได้", "HIGHLIGHT THIS LINE" in text_of(src), True)
        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ตัวตรวจแยกทึบกับโปร่งได้ และนับภาพได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1500, "height": 980}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① ไฮไลต์ต้องโปร่ง ข้อความใต้แถบต้องยังอ่านได้")
        open_editor(pg, src)
        mode(pg, "highlight")
        drag(pg, 0.10, 0.335, 0.62, 0.375)
        out1 = save_as(pg, DL / "hl.pdf")
        ck("ข้อความใต้แถบไฮไลต์ต้องยังอยู่ครบ", "HIGHLIGHT THIS LINE" in text_of(out1), True,
           f"อ่านได้: {text_of(out1)[:70]!r}")
        hl = pixel(out1, 0.30, 0.368)
        ck("ตรงแถบต้องเป็นสีไฮไลต์ ไม่ใช่กระดาษขาว", hl[2] < 215 and hl[0] > 200, True,
           f"สีที่จุดนั้น {hl} (ขาวแปลว่าไฮไลต์ไม่ติดลงไฟล์)")
        # ‼️ ข้อที่ตรงประเด็นที่สุด: จุดที่เป็น "ตัวหมึก" ใต้แถบ ต้องยังเข้มอยู่
        #    ถ้าแถบทึบ จุดนี้จะกลายเป็นสีแถบล้วน = ตัวหนังสือถูกกลืนหายไป
        ink = pixel(out1, 0.30, 0.348)
        ck("ตัวหนังสือใต้แถบต้องยังมองเห็น ไม่ถูกสีแถบกลืน", sum(ink) < 450, True,
           f"สีที่จุดตัวอักษร {ink} (ถ้าสว่างเท่าสีแถบ แปลว่าแถบทึบจนบังตัวหนังสือ)")

        print("\n── ② ปิดทับต้องทึบจริง บังของข้างใต้")
        open_editor(pg, src)
        mode(pg, "cover")
        drag(pg, 0.10, 0.575, 0.62, 0.615)
        out2 = save_as(pg, DL / "cover.pdf")
        cov = pixel(out2, 0.30, 0.595)
        ck("ตรงกล่องปิดทับต้องเป็นสีขาวทึบ", cov[0] > 245 and cov[1] > 245 and cov[2] > 245, True,
           f"สีที่จุดนั้น {cov}")

        print("\n── ③ ลายเซ็นที่วาดเองต้องไปโผล่ในไฟล์")
        open_editor(pg, src)
        mode(pg, "sign")
        draw_signature(pg)
        click_at(pg, 0.45, 0.16)
        out3 = save_as(pg, DL / "sign.pdf")
        ck("ต้องมีภาพลายเซ็นฝังในไฟล์", n_images(out3) >= 1, True, f"นับภาพได้ {n_images(out3)}")
        ck("ข้อความเดิมต้องไม่หาย", "SIGN HERE" in text_of(out3), True)

        print("\n── ④ รูปที่วางต้องไม่ถูกยืดจนบิด")
        open_editor(pg, src)
        mode(pg, "image")
        pg.locator("input[type=file]").last.set_input_files(str(logo))
        pg.wait_for_timeout(1500)
        click_at(pg, 0.45, 0.70)
        out4 = save_as(pg, DL / "img.pdf")
        ratios = img_ratio(out4)
        ck("ต้องมีรูปฝังในไฟล์", len(ratios) >= 1, True, f"ได้ {ratios}")
        if ratios:
            ck("สัดส่วนรูปต้องเท่าไฟล์ต้นทาง 3:1 (คลาดไม่เกิน 4%)",
               abs(ratios[0] - 3.0) / 3.0 < 0.04, True, f"สัดส่วนที่วางจริง {ratios[0]}")

        print("\n── ⑤ ที่เห็นบนจอ ต้องตรงกับที่ได้ในไฟล์")
        # ‼️ เครื่องมือนี้ขายว่า "วางตรงไหนได้ตรงนั้น" ถ้าจอกับไฟล์ไม่ตรง คือผิดคำสัญญา
        #    วัดกึ่งกลางแนวตั้งของสิ่งที่วาง ทั้งบนจอและในไฟล์ แล้วเทียบกับจุดที่คลิกจริง
        open_editor(pg, src)
        mode(pg, "text")
        pg.locator(".s2-side-bd input[type=text], .pe-right input[type=text]").first.fill("MARK")
        CLICK_Y = 0.50
        click_at(pg, 0.30, CLICK_Y)
        screen_mid = pg.evaluate("""() => { const l = document.querySelector('.pe-layer').getBoundingClientRect();
            const t = document.querySelector('.pe-box.text').getBoundingClientRect();
            return ((t.top + t.bottom) / 2 - l.top) / l.height; }""")
        out0 = save_as(pg, DL / "wysiwyg.pdf")
        d = fitz.open(str(out0))
        mids = [((r.y0 + r.y1) / 2) / d[0].rect.height
                for info in d[0].get_images(full=True) for r in d[0].get_image_rects(info[0])]
        d.close()
        ck("กึ่งกลางบนจอต้องตรงกับจุดที่คลิก (คลาดไม่เกิน 0.5% ของหน้า)",
           abs(screen_mid - CLICK_Y) < 0.005, True, f"บนจอ {screen_mid:.4f} คลิกที่ {CLICK_Y}")
        ck("กึ่งกลางในไฟล์ต้องตรงกับบนจอ (คลาดไม่เกิน 0.5% ของหน้า)",
           bool(mids) and abs(mids[0] - screen_mid) < 0.005, True,
           f"ในไฟล์ {mids[:1]} บนจอ {screen_mid:.4f} — ถ้าไม่ตรง แปลว่าวางแล้วเลื่อน")

        print("\n── ⑥ ทำครบ 5 อย่างในรอบเดียว บันทึกครั้งเดียว")
        open_editor(pg, src)
        mode(pg, "cover");     drag(pg, 0.10, 0.575, 0.62, 0.615)
        mode(pg, "highlight"); drag(pg, 0.10, 0.335, 0.62, 0.375)
        mode(pg, "text")
        pg.locator(".s2-side-bd input[type=text], .pe-right input[type=text]").first.fill("ใหม่ ๒๕๖๙")
        click_at(pg, 0.22, 0.60)
        mode(pg, "sign");  draw_signature(pg); click_at(pg, 0.45, 0.16)
        mode(pg, "image")
        pg.locator("input[type=file]").last.set_input_files(str(logo))
        pg.wait_for_timeout(1500)
        click_at(pg, 0.75, 0.80)
        out5 = save_as(pg, DL / "all.pdf")
        ck("รอบเดียวต้องได้ภาพครบ 3 ใบ (ข้อความไทย, ลายเซ็น, รูป)", n_images(out5), 3,
           "ข้อความไทยถูกวาดเป็นภาพเสมอ เพราะ pdf-lib ฝังฟอนต์ไทยไม่ได้")
        ck("ข้อความใต้ไฮไลต์ยังอยู่", "HIGHLIGHT THIS LINE" in text_of(out5), True)
        ck("ตรงกล่องปิดทับยังทึบ", pixel(out5, 0.55, 0.595)[0] > 245, True,
           f"สีที่จุดนั้น {pixel(out5, 0.55, 0.595)}")
        ck("ตรงแถบไฮไลต์ยังเป็นสีไฮไลต์", pixel(out5, 0.30, 0.368)[2] < 215, True)

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวแก้ไขรวมร่างทำได้ครบ 5 อย่างในรอบเดียว และลงไฟล์จริงถูกต้อง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
