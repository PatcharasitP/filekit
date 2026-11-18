#!/usr/bin/env python3
"""แก้ไขและเซ็นบน PDF: ย้ายโค้ดตัวแก้ไขไปโมดูลใช้ร่วมแล้ว ไฟล์ปกติต้องได้ผลเท่าเดิมทุกชิ้น

ที่มา 19/11/2026 แผนรวมตัวแก้ไขเข้าเครื่องมือจัดการหน้า เฟส 1 (.claude/plans/2026-11-18-merge-edit-into-pages.md)
ตัวแก้ไขย้ายจาก src/tools/pdf-edit.js ไป src/pdfmarks.js เพื่อให้เครื่องมือจัดการหน้าใช้ร่วม
พี่ปอนด์สั่งให้เก็บหน้า แก้ไขและเซ็น ไว้ จึงต้องพิสูจน์ว่าหน้านั้นยังทำงานเหมือนเดิมเป๊ะ ไม่ใช่แค่ "ยังเปิดได้"

วิธี: เล่นสคริปต์เดิมทุกครั้ง (ปิดทับ ไฮไลต์ ข้อความ ลายเซ็น รูป บนไฟล์ 3 หน้าไม่หมุน)
แล้วอ่านกรอบทุกภาพ (get_image_info) และทุกสี่เหลี่ยมสี (get_drawings) จากไฟล์ผลลัพธ์จริง
เทียบกับค่าอ้างอิงที่เก็บจากโค้ดก่อนย้าย (tests/golden/pdfedit_golden.json) คลาดได้ไม่เกิน 0.2 พอยต์ จำนวนต้องเท่ากัน

ใช้:  FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfedit_golden.py
      --record   เก็บค่าอ้างอิงใหม่ (ทำกับโค้ดรุ่นที่เชื่อถือเท่านั้น)
      --selftest ตัวเทียบต้องแดงเมื่อค่าเลื่อน 0.5 พอยต์ และเขียวเมื่อเท่ากัน
"""
import json
import os
import sys
import tempfile
from pathlib import Path

try:
    import fitz
    from PIL import Image, ImageDraw
except ImportError:
    print("ข้าม: ต้องมี PyMuPDF กับ Pillow")
    sys.exit(0)

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
GOLDEN = Path(__file__).with_name("golden") / "pdfedit_golden.json"
TOL = 0.2


def make_src(path):
    d = fitz.open()
    for i in range(3):
        p = d.new_page(width=595, height=842)
        p.insert_text((80, 120), f"Contract page {i + 1}  Date: 1 January 2026", fontsize=16)
        for k in range(8):
            p.insert_text((80, 170 + k * 26), "A line of text that should stay untouched.", fontsize=11)
    d.save(path)
    d.close()


def make_pngs(tmp):
    sig = tmp / "sig.png"
    im = Image.new("RGB", (300, 110), "white")
    dr = ImageDraw.Draw(im)
    dr.line([(10, 80), (70, 20), (120, 90), (190, 25), (290, 70)], fill="black", width=7)
    im.save(sig)
    logo = tmp / "logo.png"
    Image.new("RGB", (120, 60), (0, 120, 200)).save(logo)
    return sig, logo


def read_out(path):
    doc = fitz.open(str(path))
    out = []
    for p in doc:
        imgs = sorted([round(v, 3) for v in i["bbox"]] for i in p.get_image_info())
        rects = sorted([round(v, 3) for v in d["rect"]] + [tuple(round(c, 3) for c in (d.get("fill") or ()))]
                       for d in p.get_drawings() if d.get("fill"))
        out.append({"images": imgs, "rects": [[*r[:4], list(r[4])] for r in rects]})
    doc.close()
    return out


def compare(want, got):
    """คืนรายการข้อที่ไม่ตรง ว่าง = ตรง"""
    bad = []
    if len(want) != len(got):
        return [f"จำนวนหน้า {len(got)} ควรได้ {len(want)}"]
    for i, (w, g) in enumerate(zip(want, got)):
        for kind in ("images", "rects"):
            if len(w[kind]) != len(g[kind]):
                bad.append(f"หน้า {i + 1} {kind} มี {len(g[kind])} ควรได้ {len(w[kind])}")
                continue
            for a, b in zip(w[kind], g[kind]):
                d = max(abs(x - y) for x, y in zip(a[:4], b[:4]))
                if d > TOL or (kind == "rects" and a[4] != b[4]):
                    bad.append(f"หน้า {i + 1} {kind} {a} ได้ {b} คลาด {d:.3f}")
    return bad


def selftest():
    w = [{"images": [[10, 20, 110, 70]], "rects": [[5, 5, 50, 20, [1, 1, 1]]]}]
    same = compare(w, json.loads(json.dumps(w)))
    moved = json.loads(json.dumps(w)); moved[0]["images"][0][1] += 0.5
    miss = json.loads(json.dumps(w)); miss[0]["rects"] = []
    good = not same and compare(w, moved) and compare(w, miss)
    print(("  ✅" if good else "  ❌") + f" selftest ตัวเทียบ เท่ากัน={same} เลื่อน 0.5={bool(compare(w, moved))} หาย={bool(compare(w, miss))}")
    sys.exit(0 if good else 1)


def play(out):
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_pegold_"))
    src = tmp / "c.pdf"
    make_src(src)
    sig, logo = make_pngs(tmp)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1700}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)
        pg.set_input_files(".dz input[type=file]", [str(src)])
        pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
        pg.wait_for_timeout(1000)

        def box():
            return pg.query_selector(".pe-layer").bounding_box()

        def at(fx, fy):
            r = box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def drag(a, c):
            pg.mouse.move(*at(*a)); pg.mouse.down(); pg.mouse.move(*at(*c), steps=6); pg.mouse.up()
            pg.wait_for_timeout(250)

        def mode(m):
            pg.click(f".pe-right button[data-mode={m}]"); pg.wait_for_timeout(200)

        # หน้า 1 ปิดทับวันที่ แล้วพิมพ์ทับ ไฮไลต์ 1 แถว
        mode("cover"); drag((0.30, 0.125), (0.62, 0.150))
        mode("text"); pg.fill(".pe-right input[type=text]", "2 กุมภาพันธ์ 2569")
        pg.mouse.click(*at(0.45, 0.137)); pg.wait_for_timeout(250)
        mode("highlight"); drag((0.13, 0.195), (0.70, 0.212))
        # หน้า 2 ลายเซ็นจากรูป (ผ่านตัวถอดพื้นขาว) กับข้อความหนา
        pg.locator(".pe-thumb").nth(1).click(); pg.wait_for_timeout(800)
        mode("sign"); pg.locator(".pe-right input[type=file]").nth(0).set_input_files(str(sig)); pg.wait_for_timeout(1200)
        pg.mouse.click(*at(0.65, 0.80)); pg.wait_for_timeout(250)
        mode("text"); pg.fill(".pe-right input[type=text]", "อนุมัติ")
        pg.select_option(".pe-right select >> nth=1", "700")
        pg.mouse.click(*at(0.20, 0.82)); pg.wait_for_timeout(250)
        # หน้า 3 รูป สองชิ้น ชิ้นหนึ่งวางทับอีกชิ้น
        pg.locator(".pe-thumb").nth(2).click(); pg.wait_for_timeout(800)
        mode("image"); pg.locator(".pe-right input[type=file]").nth(1).set_input_files(str(logo)); pg.wait_for_timeout(800)
        pg.mouse.click(*at(0.30, 0.30)); pg.wait_for_timeout(250)
        pg.mouse.click(*at(0.33, 0.31)); pg.wait_for_timeout(250)
        mode("cover"); drag((0.55, 0.55), (0.80, 0.62))
        n = pg.eval_on_selector_all(".pe-box", "n => n.length")
        with pg.expect_download(timeout=60000) as dl:
            pg.locator("button.s2-cta:visible, .ws-footer button").filter(has_text="บันทึก").first.click()
            pg.wait_for_timeout(2500)
            pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
        dl.value.save_as(str(out))
        b.close()
    return errs, n


def main():
    tmp = Path(tempfile.mkdtemp(prefix="fk_pegold_out_"))
    out = tmp / "out.pdf"
    errs, n_last = play(out)
    got = read_out(out)
    total = sum(len(p["images"]) + len(p["rects"]) for p in got)
    print(f"      ไฟล์ผลลัพธ์: ภาพและสี่เหลี่ยมรวม {total} ชิ้น ใน {len(got)} หน้า")
    if "--record" in sys.argv:
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(got, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  ✅ เก็บค่าอ้างอิงแล้ว {GOLDEN}")
        sys.exit(1 if errs else 0)
    bad = compare(json.loads(GOLDEN.read_text(encoding="utf-8")), got)
    fails = 0
    for line in bad:
        print(f"  ❌ {line}"); fails += 1
    if not bad:
        print(f"  ✅ ทุกชิ้นตรงกับค่าอ้างอิงก่อนย้ายโค้ด ไม่เกิน {TOL} พอยต์ ({total} ชิ้น)")
    if errs:
        print(f"  ❌ มี error ในหน้าเว็บ {errs[:2]}"); fails += 1
    print(f"\nตก {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
