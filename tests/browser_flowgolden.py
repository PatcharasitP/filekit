# FlowKit: ผังตัวอย่างทั้งชุด (tests/flow_golden/*.txt) ยิงผ่านหน้าเว็บจริง แล้วดูผลทั้งแบบตัวเลขและแบบภาพ
#
# ‼️ ทำไมต้องมีทั้งสองชั้น (แผน FlowKit ข้อ 1.3 และ 9)
#    ทุกหลุมที่เจอตอนยิง draw.io ครั้งแรก (กลุ่มยุบ ผังสูงเกินสไลด์ ผังกว้างจนอ่านไม่ออก ป้ายเส้นทับกัน)
#    ตัวเลขใน XML บอกว่า "ครบ" หมด ต้องเปิดภาพถึงเห็น จึงทำ contact sheet ทุกรอบ แล้วฟ้าเปิดดูเองก่อนปล่อย
# ‼️ ตัวเลขที่เทียบได้อัตโนมัติ: กล่องกับกลุ่มครบ ข้อความตรงทุกกล่อง และขนาดภาพต้องไม่เปลี่ยนเกิน 15% จากรอบก่อน
#    (draw.io เปลี่ยนตัวแปลง Mermaid เมื่อไร ผังจะเปลี่ยนหน้าตาโดยเราไม่รู้ ข้อนี้คือสัญญาณเตือนแรก ความเสี่ยงข้อ 3)
#
# ใช้: ../.venv/bin/python tests/browser_flowgolden.py            (เทียบกับขนาดที่บันทึกไว้)
#      ../.venv/bin/python tests/browser_flowgolden.py --update   (บันทึกขนาดชุดใหม่ หลังเปิดดู contact sheet แล้วว่าถูก)
#      ../.venv/bin/python tests/browser_flowgolden.py --selftest (ตัวเทียบขนาดกับตัวเทียบข้อความต้องจับของผิดได้)

import sys, os, re, io, json, base64, pathlib, traceback
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawio_xml, cells, preview_png, set_text, state   # ตัวอ่านไฟล์ผลตัวเดียวกัน ไม่เขียนซ้ำ

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
URL = BASE + "/flow/"
HERE = pathlib.Path(__file__).resolve().parent
GOLD = HERE / "flow_golden"
SIZES = GOLD / "sizes.json"
SHEET_DIR = HERE.parents[1] / ".claude" / "evidence" / "flowkit-golden"
UPDATE = "--update" in sys.argv
SELFTEST = "--selftest" in sys.argv
TOLERANCE = 0.15

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def size_drift(old, new):
    """ความต่างของขนาดภาพ (สัดส่วนที่มากกว่าระหว่างกว้างกับสูง)"""
    return max(abs(new[0] - old[0]) / old[0], abs(new[1] - old[1]) / old[1])


def expect(pg, text):
    """ผลที่ควรได้ คิดด้วยโมดูลตัวเดียวกับที่หน้าเว็บใช้ (ไม่เขียนตัวอ่านซ้ำใน Python)"""
    return pg.evaluate("""async (t) => { const { parseText } = await import('./src/parse.js');
        const r = parseText(t, 'steps'); if (!r.model) return null;
        return { kind: r.model.kind, boxes: r.model.nodes.map((n) => n.text), groups: r.model.groups.map((g) => g.title) }; }""", text)


def render(pg, want_texts, ms=45000):
    """รอจนภาพบนจอมีข้อความครบตามที่คาด คืน (png, xml) ของรอบนั้น"""
    want = sorted(want_texts); waited = 0; png = b""; xml = ""
    while waited <= ms:
        if state(pg) == "ready" and not pg.evaluate("() => document.querySelector('#live').hasAttribute('data-busy')"):
            png = preview_png(pg); xml = drawio_xml(png) or ""
            if sorted(t for t, _ in cells(xml)) == want: return png, xml
        pg.wait_for_timeout(400); waited += 400
    return png, xml


def outside_groups(xml):
    """กล่องที่ล้นกรอบกลุ่มของตัวเอง (พิกัดของกล่องในกลุ่มนับจากมุมกรอบ) ‼️ เคยเกิดจริงตอนยืดผังระบบแล้วจับกรอบไม่เจอ 22/09/2026"""
    import xml.etree.ElementTree as ET
    try: root = ET.fromstring(xml)
    except Exception: return ["อ่าน XML ไม่ได้"]
    geo, groups, bad = {}, set(), []
    for uo in root.iter("UserObject"):
        c = uo.find("mxCell"); g = c.find("mxGeometry") if c is not None else None
        if g is None or c.get("vertex") != "1": continue
        f = lambda k: float(g.get(k, 0) or 0)
        geo[uo.get("id")] = (c.get("parent"), f("x"), f("y"), f("width"), f("height"), uo.get("label", ""))
        if (uo.get("mermaidId") or "").startswith("n:g"): groups.add(uo.get("id"))
    for cid, (parent, x, y, w, h, label) in geo.items():
        if parent in groups:
            W, H = geo[parent][3], geo[parent][4]
            if x < -1 or y < -1 or x + w > W + 1 or y + h > H + 1: bad.append(label[:20])
    return bad


def contact_sheet(items, path):
    from PIL import Image, ImageDraw, ImageFont
    font = None
    for f in ("/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if pathlib.Path(f).exists(): font = ImageFont.truetype(f, 22); break
    font = font or ImageFont.load_default()
    cols, cell_w, cell_h, head = 4, 640, 560, 44
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * (cell_h + head)), "#e9e7e2")
    d = ImageDraw.Draw(sheet)
    for i, (name, png, size) in enumerate(items):
        x, y = (i % cols) * cell_w, (i // cols) * (cell_h + head)
        d.text((x + 14, y + 10), f"{name}  {size[0]}x{size[1]}", fill="#14161c", font=font)
        if not png: continue
        im = Image.open(io.BytesIO(png)).convert("RGB")
        im.thumbnail((cell_w - 20, cell_h - 12))
        sheet.paste(im, (x + (cell_w - im.width) // 2, y + head))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def main():
    if SELFTEST:
        print("\n━━ selftest ━━")
        ck("ตัวเทียบขนาดจับผังที่สูงขึ้น 20% ได้", size_drift([400, 1000], [400, 1200]) > TOLERANCE)
        ck("ตัวเทียบขนาดปล่อยผังที่ต่างแค่ 3% ผ่าน", size_drift([400, 1000], [412, 1000]) <= TOLERANCE)
        bad = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><UserObject label="ก" id="2"><mxCell vertex="1" parent="1" style=""/></UserObject></root></mxGraphModel></diagram></mxfile>'
        ck("ตัวอ่านข้อความในกล่องเห็นกล่องที่ขาดไป (ได้ 1 ไม่ใช่ 2)", len(cells(bad)) == 1)
        spill = ('<mxfile><diagram><mxGraphModel><root><UserObject label="กลุ่ม" mermaidId="n:g1" id="2"><mxCell vertex="1" parent="1">'
                 '<mxGeometry height="100" width="200" x="0" as="geometry"/></mxCell></UserObject><UserObject label="ล้น" mermaidId="n:n1" id="3">'
                 '<mxCell vertex="1" parent="2"><mxGeometry height="50" width="80" x="150" y="20" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>')
        ck("ตัวตรวจกรอบกลุ่มจับกล่องที่ล้นกรอบได้", outside_groups(spill) == ["ล้น"])
        return finish()

    files = sorted(GOLD.glob("*.txt"))
    ck(f"มีผังตัวอย่างให้ยิง ({len(files)} ใบ ต้องไม่น้อยกว่า 13)", len(files) >= 13)
    base = json.loads(SIZES.read_text(encoding="utf-8")) if SIZES.exists() else {}
    got_sizes, items = {}, []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(URL)
        pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready'", timeout=60000)
        for f in files:
            name = f.stem
            text = f.read_text(encoding="utf-8")
            exp = expect(pg, text)
            if not ck(f"[{name}] ข้อความอ่านผ่าน", exp is not None):
                continue
            set_text(pg, text)
            png, xml = render(pg, exp["boxes"] + exp["groups"])
            texts = sorted(t for t, _ in cells(xml))
            want = sorted(exp["boxes"] + exp["groups"])
            ck(f"[{name}] {exp['kind']} กล่อง {len(exp['boxes'])} กลุ่ม {len(exp['groups'])} ข้อความตรงทุกกล่อง", texts == want,
               f"ขาด {sorted(set(want) - set(texts))[:4]} เกิน {sorted(set(texts) - set(want))[:4]}")
            # ขนาดพิกเซลจริงของไฟล์ (อ่านจากหัว PNG) ไม่ใช่ naturalWidth ของหน้าจอ ซึ่งเปลี่ยนตามความละเอียดจอ (srcset 2x)
            size = [int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")] if png[:8] == b"\x89PNG\r\n\x1a\n" else [0, 0]
            if exp["groups"]:
                bad = outside_groups(xml)
                ck(f"[{name}] ทุกกล่องอยู่ในกรอบกลุ่มของตัวเอง ไม่ล้นกรอบ", not bad, f"ล้น {bad}")
            got_sizes[name] = size
            items.append((name, png, size))
            if name in base and not UPDATE:
                drift = size_drift(base[name], size)
                ck(f"[{name}] ขนาดภาพเท่ารอบก่อน (ต่าง {drift:.0%} เกณฑ์ ≤ {TOLERANCE:.0%})", drift <= TOLERANCE, f"รอบก่อน {base[name]} รอบนี้ {size}")
        b.close()
    sheet = SHEET_DIR / "contact-sheet.png"
    contact_sheet(items, sheet)
    print(f"\n  ภาพรวมทุกผัง: {sheet}  ‼️ เปิดดูด้วยตาก่อนปล่อยทุกครั้ง")
    missing = [f.stem for f in files if f.stem not in base]
    if UPDATE or not base:
        SIZES.write_text(json.dumps(got_sizes, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  บันทึกขนาดชุดใหม่ลง {SIZES.name} แล้ว ({len(got_sizes)} ใบ)")
    elif missing:
        ck("ทุกผังมีขนาดบันทึกไว้เทียบ", False, f"ยังไม่มี {missing} (รันด้วย --update หลังเปิดดูภาพแล้ว)")
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวเทียบจับของผิดได้" if SELFTEST else "✅ ผังตัวอย่างทุกใบวาดครบ ขนาดคงที่ (อย่าลืมเปิดดู contact sheet)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
