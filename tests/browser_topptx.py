# ตรวจเครื่องมือ "PDF เป็น PowerPoint"
#
# ‼️ ไฟล์ .pptx คือไฟล์ ZIP ที่มี XML ข้างใน เทสจึงเปิดดูโครงสร้างจริงได้
#    ตรวจว่า ① เป็น pptx ที่ถูกต้อง ② จำนวนสไลด์ตรงกับจำนวนหน้า ③ แต่ละสไลด์มีภาพจริง
# ‼️ และต้องไม่บิดสัดส่วน: หน้าแนวตั้งวางบนสไลด์แนวนอนต้องไม่ถูกยืดจนอ่านไม่ได้

import sys, os, re, zipfile, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_pptx_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make(path, n=3, size=(595, 842)):
    d = fitz.open()
    for i in range(n):
        p = d.new_page(width=size[0], height=size[1])
        p.insert_text((60, 120), f"SLIDE-{i + 1}", fontname="helv", fontsize=30)
    d.save(str(path)); d.close()
    return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def convert(pg, src, layout=None, out_name="out.pptx"):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-to-powerpoint", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(2000)
    if layout:
        pg.locator(".s2-side-bd select").first.select_option(layout)
        pg.wait_for_timeout(500)
    act(pg, "แปลงเป็น PowerPoint")
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=60000)
    except Exception:
        loc = pg.locator(".results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=60000)
    with pg.expect_download() as dl:
        loc.first.click()
    out = DL / out_name
    dl.value.save_as(str(out))
    return out


def inspect(path):
    """เปิด pptx เหมือนเป็น ZIP แล้วอ่านโครงสร้างจริง"""
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    slides = [n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    media = [n for n in names if n.startswith("ppt/media/")]
    pres = zf.read("ppt/presentation.xml").decode("utf-8", "ignore") if "ppt/presentation.xml" in names else ""
    m = re.search(r'sldSz[^/]*cx="(\d+)"[^/]*cy="(\d+)"', pres)
    size = (int(m.group(1)), int(m.group(2))) if m else None
    # ขนาดภาพบนสไลด์แรก หน่วย EMU
    ext = None
    if slides:
        x = zf.read(sorted(slides)[0]).decode("utf-8", "ignore")
        # ‼️ ต้องอ่านจากบล็อก <p:pic> ของภาพ ไม่ใช่ <a:ext> ตัวแรกในไฟล์
        #    ตัวแรกมักเป็นกรอบของสไลด์เองซึ่ง cy เป็น 0 แล้วตัวตรวจจะหารด้วยศูนย์
        pic = re.search(r"<p:pic>.*?</p:pic>", x, re.S)
        if pic:
            e = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"', pic.group(0))
            if e: ext = (int(e.group(1)), int(e.group(2)))
    return {"slides": len(slides), "media": len(media), "size": size, "firstImage": ext,
            "hasContentTypes": "[Content_Types].xml" in names}


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    portrait = make(FIX / "portrait.pdf", 3)

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        ok1 = ck("ไฟล์ทดสอบต้องเป็น PDF 3 หน้าแนวตั้ง", fitz.open(str(portrait)).page_count, 3)
        bad = FIX / "notpptx.zip"
        with zipfile.ZipFile(bad, "w") as z: z.writestr("hello.txt", "ไม่ใช่ pptx")
        r = inspect(bad)
        ok2 = ck("ไฟล์ที่ไม่ใช่ pptx ต้องไม่มีสไลด์", r["slides"], 0)
        ok3 = ck("ไฟล์ที่ไม่ใช่ pptx ต้องไม่มี Content_Types", r["hasContentTypes"], False,
                 "ถ้าตัวตรวจบอกว่ามี แปลว่ามันแยกไฟล์จริงกับไฟล์ปลอมไม่ออก")
        good = all([ok1, ok2, ok3])
        print("\n" + ("✅ ตัวตรวจแยกไฟล์ pptx จริงกับปลอมได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① แปลงเป็นสไลด์จอกว้าง")
        out = convert(pg, portrait, "wide", "wide.pptx")
        r = inspect(out)
        ck("ต้องเป็นไฟล์ pptx ที่มีโครงสร้างถูกต้อง", r["hasContentTypes"], True)
        ck("จำนวนสไลด์ต้องเท่าจำนวนหน้า", r["slides"], 3)
        ck("ต้องมีภาพอย่างน้อยเท่าจำนวนสไลด์", r["media"] >= 3, True,
           f"ไฟล์ภาพใน pptx ที่พบ {r['media']} (ไลบรารีอาจแนบภาพของธีมมาด้วย จึงไม่บังคับเท่ากันเป๊ะ)")
        # 1 นิ้ว = 914400 EMU · ยอมคลาดได้เล็กน้อยจากการปัดทศนิยมของ 13.333
        ck("ขนาดสไลด์ต้องเป็น 16:9 ตามที่เลือก",
           r["size"] and abs(r["size"][0] - 12192000) < 20000 and abs(r["size"][1] - 6858000) < 20000, True,
           f"ได้ {r['size']} · 13.333 x 7.5 นิ้ว = ราว 12192000 x 6858000 EMU")

        print("\n── ② หน้าแนวตั้งบนสไลด์แนวนอน ต้องไม่ถูกยืดจนบิด")
        ext = r["firstImage"]
        ck("ต้องอ่านขนาดภาพบนสไลด์ได้", ext is not None, True)
        if ext and r["size"]:
            ratio_img = ext[0] / ext[1]
            ratio_src = 595 / 842
            ck("สัดส่วนภาพต้องตรงกับหน้า PDF เดิม (คลาดไม่เกิน 2%)",
               abs(ratio_img - ratio_src) / ratio_src < 0.02, True,
               f"สัดส่วนภาพ {ratio_img:.3f} · สัดส่วนหน้าเดิม {ratio_src:.3f}")
            ck("ภาพต้องไม่กว้างเกินสไลด์", ext[0] <= r["size"][0], True)
            ck("ภาพต้องไม่สูงเกินสไลด์", ext[1] <= r["size"][1], True)

        print("\n── ③ โหมดตามสัดส่วนหน้า PDF")
        out3 = convert(pg, portrait, "fit", "fit.pptx")
        r3 = inspect(out3)
        ck("สไลด์ต้องเป็นแนวตั้งตามหน้า PDF", r3["size"][0] < r3["size"][1], True,
           f"ขนาดสไลด์ที่ได้ {r3['size']}")
        ck("จำนวนสไลด์ยังต้องครบ", r3["slides"], 3)

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ได้ไฟล์ PowerPoint จริง สไลด์ครบ และสัดส่วนไม่บิด")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
