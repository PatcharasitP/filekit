# เทียบผลลัพธ์ของเครื่องมือที่ใช้ pdf-lib "ก่อน" กับ "หลัง" สลับไลบรารี
#
# ทำไมต้องมี: เฟส 0 ของแผน 21/09/2026 สลับ vendor/pdf-lib.min.js จาก Hopding 1.17.1
# (เลิกดูแลตั้งแต่ 17/07/2024) เป็น @cantoo/pdf-lib 2.11.1 ซึ่งเป็น fork MIT ที่ยังดูแลอยู่
# ไลบรารีตัวนี้ถูกใช้โดยเครื่องมือ 11 ตัว การสลับจึงต้องพิสูจน์ว่า "ผลลัพธ์ไม่เปลี่ยน"
# ไม่ใช่แค่ "เปิดแล้วไม่ error"
#
# วิธีใช้ (รันจากโฟลเดอร์ FileKit/ หลังเปิดเซิร์ฟเวอร์แล้ว):
#   ① ก่อนสลับ:  FK_BASE=... python tests/pdflib_swap.py --record
#   ② สลับไฟล์ vendor/pdf-lib.min.js
#   ③ หลังสลับ:  FK_BASE=... python tests/pdflib_swap.py --compare
#   ตรวจตัวตรวจเอง: FK_BASE=... python tests/pdflib_swap.py --selftest
#
# ‼️ ลายนิ้วมือที่เก็บต้องเป็นของที่ "ผู้ใช้เห็น" ไม่ใช่ไบต์ของไฟล์
#    เพราะไลบรารีคนละรุ่นเขียนไบต์ไม่เหมือนกันแน่นอน (id, วันที่, ลำดับ object)
#    แต่จำนวนหน้า ขนาดหน้า ข้อความ จำนวนรูป มุมหมุน และภาพที่เรนเดอร์ออกมา ต้องเท่าเดิม
#    ตรวจด้วย PyMuPDF ซึ่งเป็นคนละเครื่องยนต์กับตัวที่สร้างไฟล์ จึงไม่เข้าข้างกัน

import sys, os, io, json, hashlib, pathlib, tempfile, shutil, zipfile, traceback
from playwright.sync_api import sync_playwright

import fitz            # PyMuPDF
from PIL import Image

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
HERE = pathlib.Path(__file__).resolve().parent
SNAP = HERE / "fixtures" / "pdflib-baseline.json"

MODE = "compare"
for a in sys.argv[1:]:
    if a in ("--record", "--compare", "--selftest"):
        MODE = a[2:]

ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_swap_"))
FIX, DL = ROOT / "fix", ROOT / "dl"


# ── ไฟล์ตัวอย่าง: สร้างเองทุกครั้งด้วยค่าคงที่ จะได้เทียบสองรอบได้ ────────────
THAI_FONT = "/mnt/c/Windows/Fonts/leelawad.ttf"


def make_pdf(path, texts, size=(400, 600), thai=False, rotate=0):
    doc = fitz.open()
    for t in texts:
        pg = doc.new_page(width=size[0], height=size[1])
        if thai:
            pg.insert_font(fontname="tf", fontfile=THAI_FONT)
            pg.insert_text((40, 80), t, fontname="tf", fontfile=THAI_FONT, fontsize=18)
        else:
            pg.insert_text((40, 80), t, fontname="helv", fontsize=16)
        if rotate:
            pg.set_rotation(rotate)
    doc.save(str(path)); doc.close()
    return path


def make_png(path, size, color):
    Image.new("RGB", size, color).save(path, "PNG")
    return path


# ── ลายนิ้วมือของ PDF: สิ่งที่ผู้ใช้เห็น ไม่ใช่ไบต์ ─────────────────────────
def fp_pdf(data: bytes):
    d = fitz.open(stream=data, filetype="pdf")
    pages = []
    for i in range(d.page_count):
        p = d[i]
        # ภาพเรนเดอร์ 40 dpi พอให้จับ "หน้าเปลี่ยนหน้าตาไหม" โดยไม่อ่อนไหวกับการปัดเศษระดับพิกเซล
        pix = p.get_pixmap(dpi=40, colorspace=fitz.csGRAY)
        # ลดรายละเอียดลงอีกชั้นก่อน hash: ปัดค่าเทาเป็น 16 ระดับ กันความต่างระดับ anti-alias
        coarse = bytes((b // 16) for b in pix.samples)
        pages.append({
            "size": [round(p.rect.width, 1), round(p.rect.height, 1)],
            "rot": p.rotation,
            "text": p.get_text().strip(),
            "images": len(p.get_images(full=True)),
            "links": len(p.get_links()),
            "annots": len(list(p.annots() or [])),
            "render": hashlib.sha256(coarse).hexdigest()[:16],
        })
    out = {"kind": "pdf", "pages": d.page_count, "encrypted": bool(d.needs_pass), "detail": pages}
    d.close()
    return out


def fp_zip(data: bytes):
    zf = zipfile.ZipFile(io.BytesIO(data))
    items = []
    for n in sorted(zf.namelist()):
        raw = zf.read(n)
        if n.lower().endswith(".pdf"):
            items.append({"name": n, **fp_pdf(raw)})
        else:
            im = Image.open(io.BytesIO(raw))
            items.append({"name": n, "kind": "img", "size": list(im.size), "mode": im.mode,
                          "render": hashlib.sha256(im.convert("L").resize((64, 64)).tobytes()).hexdigest()[:16]})
    return {"kind": "zip", "count": len(items), "detail": items}


def fp(path: pathlib.Path):
    data = path.read_bytes()
    if data[:4] == b"%PDF":
        return fp_pdf(data)
    if data[:2] == b"PK":
        return fp_zip(data)
    im = Image.open(io.BytesIO(data))
    return {"kind": "img", "size": list(im.size), "mode": im.mode,
            "render": hashlib.sha256(im.convert("L").resize((64, 64)).tobytes()).hexdigest()[:16]}


# ── ตัวขับหน้าเว็บ (เขียนให้ทนทั้งโครงเก่าและใหม่ เหมือน browser_output.py) ──
def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, has_text=None, timeout=25000):
    # ‼️ ต้องเจาะจง "แผงผลลัพธ์" ไม่ใช่ทั้งแผงขวา ไม่งั้นจะไปเจอปุ่มตั้งค่าอื่น
    #    (เจอจริง: pdf-page-numbers มีปุ่ม "คัดลอกลิงก์ค่านี้" อยู่ในแผง กดแล้วไม่มีไฟล์ลงมา)
    side = ".s2-side-res button:visible, .s2-subrow button:visible"
    stage = (".s2-res-list .result button:visible, .results .result button:visible, "
             ".results button:visible, .result button:visible")
    loc = pg.locator(side)
    if has_text:
        loc = loc.filter(has_text=has_text)
    try:
        loc.first.wait_for(state="visible", timeout=6000)
    except Exception:
        loc = pg.locator(stage)
        if has_text:
            loc = loc.filter(has_text=has_text)
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def open_tool(pg, tool, files):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(f) for f in files])
    pg.wait_for_timeout(700)


# ── เครื่องมือที่ใช้ pdf-lib ทั้ง 11 ตัว ─────────────────────────────────────
# คู่ (ชื่อเครื่องมือ, ฟังก์ชันที่รันแล้วคืน path ไฟล์ผลลัพธ์)
def c_merge(pg):
    a = make_pdf(FIX / "m-a.pdf", ["MERGE-A1"])
    b = make_pdf(FIX / "m-b.pdf", ["MERGE-B1", "MERGE-B2"])
    open_tool(pg, "pdf-merge", [a, b])
    act(pg, "รวมไฟล์")
    return dl_result(pg, DL / "merge.pdf")


def c_split(pg):
    src = make_pdf(FIX / "sp.pdf", [f"SP{i}" for i in range(1, 6)])
    open_tool(pg, "pdf-split", [src])
    pg.wait_for_selector('input[type=radio][value="every"]')
    pg.locator('input[type=radio][value="every"]').check()
    pg.locator('input[type=number]').first.fill("2")
    pg.wait_for_timeout(300)
    act(pg, "แยกไฟล์")
    return dl_result(pg, DL / "split.zip", "ZIP")


def c_pages(pg):
    src = make_pdf(FIX / "pg.pdf", ["PG1", "PG2", "PG3", "PG4"])
    open_tool(pg, "pdf-pages", [src])
    pg.wait_for_selector(".pg")
    d = pg.get_by_label("ลบหน้า 2"); d.hover(); d.click()
    r = pg.get_by_label("หมุนหน้า 1 ไปทางขวา"); r.hover(); r.click()
    pg.wait_for_timeout(300)
    act(pg, "บันทึก")
    return dl_result(pg, DL / "pages.pdf")


def c_watermark(pg):
    src = make_pdf(FIX / "wm.pdf", ["WM1", "WM2"])
    open_tool(pg, "pdf-watermark", [src])
    act(pg, "ใส่ลายน้ำ")
    return dl_result(pg, DL / "wm.pdf")


def c_pagenum(pg):
    src = make_pdf(FIX / "pn.pdf", ["PN1", "PN2", "PN3"])
    open_tool(pg, "pdf-page-numbers", [src])
    act(pg, "ใส่เลขหน้า")
    # ‼️ ต้องระบุข้อความ เพราะแผงผลลัพธ์มีปุ่ม "คัดลอกลิงก์ค่านี้" ปนอยู่ด้วย
    return dl_result(pg, DL / "pn.pdf", "ดาวน์โหลด")


def c_i2p(pg):
    imgs = [make_png(FIX / f"i{i}.png", s, c) for i, (s, c) in
            enumerate([((400, 300), (200, 40, 20)), ((300, 300), (20, 60, 200))])]
    open_tool(pg, "images-to-pdf", imgs)
    act(pg, "สร้างไฟล์ PDF")
    return dl_result(pg, DL / "i2p.pdf")


def c_compress(pg):
    src = make_pdf(FIX / "cp.pdf", ["CP1", "CP2"])
    open_tool(pg, "pdf-compress", [src])
    act(pg, "บีบอัดไฟล์")
    # ‼️ ถ้าไฟล์มีชั้นข้อความ เครื่องมือจะเตือนก่อนว่าข้อความจะกลายเป็นภาพ ต้องกดยืนยัน
    warn = pg.locator("button").filter(has_text="บีบต่อโดยยอมให้ข้อความหาย")
    try:
        warn.first.wait_for(state="visible", timeout=4000); warn.first.click()
    except Exception:
        pass
    return dl_result(pg, DL / "cp.pdf", "ดาวน์โหลด")


def c_removeblank(pg):
    # ‼️ หน้าที่ "ไม่ว่าง" ต้องมีหมึกมากพอจริง ๆ ไม่งั้นเครื่องมือจะตัดสินว่าว่างทั้งเล่ม
    #    แล้วปุ่มบันทึกจะถูกปิดไว้ (พฤติกรรมถูกต้องของเครื่องมือ ไม่ใช่บั๊ก)
    doc = fitz.open()
    for t in ["RB1", "", "RB3"]:
        p = doc.new_page(width=400, height=600)
        if t:
            for y in range(80, 520, 26):
                p.insert_text((40, y), t + " ขอบคุณที่ใช้งาน FileKit " * 2, fontname="helv", fontsize=14)
    src = FIX / "rb.pdf"; doc.save(str(src)); doc.close()
    open_tool(pg, "pdf-remove-blank", [src])
    act(pg, "บันทึกไฟล์ที่ตัดหน้าว่างออกแล้ว")
    return dl_result(pg, DL / "rb.pdf", "ดาวน์โหลด")


CASES = [
    ("pdf-merge", c_merge),
    ("pdf-split", c_split),
    ("pdf-pages", c_pages),
    ("pdf-watermark", c_watermark),
    ("pdf-page-numbers", c_pagenum),
    ("images-to-pdf", c_i2p),
    ("pdf-compress", c_compress),
    ("pdf-remove-blank", c_removeblank),
]
# ‼️ ที่ยังไม่อยู่ในชุดนี้ 3 ตัว พร้อมเหตุผล (ไม่ใช่เพราะขี้เกียจ)
#   pdf-edit, pdf-sign  ต้องลากเมาส์วางของ ผลลัพธ์จึงขึ้นกับพิกัดที่ลาก ไม่คงที่พอจะเทียบ hash
#                       (browser_output.py คุมสองตัวนี้ด้วยการ assert คุณสมบัติแทน)
#   pdf-unstamp         ต้องมีไฟล์ที่มีชั้นลายน้ำจริงเป็นตัวตั้ง สร้างสังเคราะห์ให้ตรงยาก
#                       (browser_unstamp.py คุมอยู่แล้ว)


def run_all():
    got = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        for name, fn in CASES:
            try:
                out = fn(pg)
                got[name] = fp(out)
                print(f"  ✅ {name}: {got[name]['kind']} "
                      f"{got[name].get('pages', got[name].get('count', ''))}", flush=True)
            except Exception as e:
                got[name] = {"kind": "error", "error": str(e)[:300]}
                print(f"  💥 {name}: {str(e)[:120]}", flush=True)
        b.close()
    return got


def diff(old, new):
    """คืนรายการความต่างแบบอ่านออก (path, ค่าเก่า, ค่าใหม่)"""
    out = []

    def walk(a, b, path):
        if type(a) is not type(b):
            out.append((path, repr(a)[:80], repr(b)[:80])); return
        if isinstance(a, dict):
            for k in sorted(set(a) | set(b)):
                if k not in a: out.append((f"{path}.{k}", "ไม่มี", repr(b[k])[:80]))
                elif k not in b: out.append((f"{path}.{k}", repr(a[k])[:80], "ไม่มี"))
                else: walk(a[k], b[k], f"{path}.{k}")
        elif isinstance(a, list):
            if len(a) != len(b):
                out.append((f"{path}[จำนวน]", len(a), len(b))); return
            for i, (x, y) in enumerate(zip(a, b)):
                walk(x, y, f"{path}[{i}]")
        elif a != b:
            out.append((path, repr(a)[:80], repr(b)[:80]))

    walk(old, new, "")
    return out


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)

    if MODE == "selftest":
        # ‼️ พิสูจน์ตัวตรวจก่อนเชื่อ: ป้อนของที่ "รู้ว่าต่าง" แล้วมันต้องจับได้
        print("ตรวจตัวตรวจเอง (ต้องจับความต่างได้ทุกข้อ)")
        base = make_pdf(FIX / "st-base.pdf", ["AAA", "BBB"])
        cases = [
            ("ข้อความเปลี่ยน", make_pdf(FIX / "st-text.pdf", ["AAA", "CCC"])),
            ("จำนวนหน้าเปลี่ยน", make_pdf(FIX / "st-count.pdf", ["AAA"])),
            ("ขนาดหน้าเปลี่ยน", make_pdf(FIX / "st-size.pdf", ["AAA", "BBB"], size=(400, 700))),
            ("มุมหมุนเปลี่ยน", make_pdf(FIX / "st-rot.pdf", ["AAA", "BBB"], rotate=90)),
        ]
        a = fp(base)
        bad = []
        for label, path in cases:
            d = diff(a, fp(path))
            print(f"  {'✅' if d else '❌'} {label}: เจอความต่าง {len(d)} จุด")
            if not d: bad.append(label)
        same = diff(a, fp(make_pdf(FIX / "st-same.pdf", ["AAA", "BBB"])))
        print(f"  {'✅' if not same else '❌'} ไฟล์เหมือนกันต้องไม่มีความต่าง: เจอ {len(same)} จุด")
        if same: bad.append("ไฟล์เหมือนกันแต่ฟ้องว่าต่าง")
        if bad:
            print("\n❌ ตัวตรวจเชื่อไม่ได้:", ", ".join(bad)); return 1
        print("\n✅ ตัวตรวจใช้ได้ จับความต่างได้ทุกแบบ และไม่ฟ้องผิดเมื่อเหมือนกัน")
        return 0

    print(f"รันเครื่องมือ {len(CASES)} ตัวที่ใช้ pdf-lib ({BASE})")
    got = run_all()
    errs = [k for k, v in got.items() if v.get("kind") == "error"]

    if MODE == "record":
        if errs:
            print(f"\n❌ มีเครื่องมือที่รันไม่ผ่าน {len(errs)} ตัว: {', '.join(errs)}")
            print("   ต้องซ่อมให้รันได้ก่อน ไม่งั้นค่าอ้างอิงจะไม่ครบ")
            return 1
        SNAP.parent.mkdir(parents=True, exist_ok=True)
        SNAP.write_text(json.dumps(got, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n✅ บันทึกค่าอ้างอิง {len(got)} เครื่องมือ ลง {SNAP}")
        return 0

    if not SNAP.exists():
        print(f"\n❌ ยังไม่มีค่าอ้างอิงที่ {SNAP} ต้องรัน --record ก่อนสลับไลบรารี")
        return 1
    old = json.loads(SNAP.read_text(encoding="utf-8"))

    print("\n" + "━" * 70)
    fails = []
    for name, _ in CASES:
        if name not in old:
            print(f"  ⚠️  {name}: ไม่มีในค่าอ้างอิง (ข้าม)"); continue
        if got[name].get("kind") == "error":
            fails.append((name, [("รันไม่ผ่าน", "-", got[name]["error"])])); print(f"  ❌ {name}: รันไม่ผ่าน"); continue
        d = diff(old[name], got[name])
        if d:
            fails.append((name, d)); print(f"  ❌ {name}: ต่างจากเดิม {len(d)} จุด")
        else:
            print(f"  ✅ {name}: เหมือนเดิมทุกอย่าง")
    print("━" * 70)

    if fails:
        print(f"\nผลลัพธ์เปลี่ยนไป {len(fails)} เครื่องมือ:")
        for name, d in fails:
            print(f"\n  [{name}]")
            for path, a, b in d[:12]:
                print(f"    {path}\n      เดิม {a}\n      ใหม่ {b}")
            if len(d) > 12: print(f"    ... อีก {len(d) - 12} จุด")
        return 1
    print(f"\n✅ ผลลัพธ์ของทั้ง {len(CASES)} เครื่องมือเหมือนเดิมทุกอย่าง สลับไลบรารีได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
