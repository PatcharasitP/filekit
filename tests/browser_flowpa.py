# FlowKit ทางเข้า ② (แผนเฟส 4): flow ของ Power Automate เป็นผัง ผ่านหน้าเว็บจริง
#
# ‼️ ของลับต้องไม่หลุดไปถึงไฟล์ที่ผู้ใช้เอาไปแชร์: วาง flow ที่มี connection , URL , อีเมล , token แล้วค้นในช่องพิมพ์ ,
#    sessionStorage , XML ที่ฝังใน PNG และทุกไบต์ของ PNG (tests/flow_pa.test.mjs ค้นชั้น FlowModel กับ Mermaid แล้ว)
# ‼️ กรอบซ้อนกรอบ: draw.io คำนวณจุดเสียบเส้นผิด (engine_probe12) เทสนี้อ่านตำแหน่งกล่องจริงใน XML
#    แล้วถามว่ามีเส้นไหนเสียบกล่องปลายทางจากด้านที่หันหนี (เส้นทะลุกล่อง) ไหม
# ‼️ ต้องต่อเน็ตได้ (draw.io) , flow ทุกตัวเป็นของสมมติใน tests/flow_pa (W6 ห้ามใช้ flow ของบริษัท)
#
# --selftest ตัวค้นของลับต้องเจอของลับที่แอบใส่ใน PNG และตัวตรวจเส้นต้องจับเส้นที่เสียบผิดด้านได้

import sys, os, re, zlib, html, base64, struct, pathlib, traceback, urllib.parse
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawn, drawio_xml, preview_png, state

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
SELFTEST = "--selftest" in sys.argv
FX = pathlib.Path(__file__).resolve().parent / "flow_pa"
SHOTS = pathlib.Path(__file__).resolve().parents[2] / ".claude" / "evidence" / "flowkit-build-2026-09-22" / "pa"
SECRETS = ["SECRET", "example.com", "contoso", "logic.azure.com", "Bearer", "hunter2", "sig=", "@", "https://", "shared_", "shared-office365",
           "connectionName", "operationMetadataId", "5d0c7c1e", "SE Asia Standard Time"]

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def png_texts(png: bytes):
    """ข้อความทุกชิ้นใน PNG ที่แกะแล้ว (tEXt , zTXt , iTXt และผังที่ draw.io บีบอัดไว้ใน <diagram>)
    ‼️ ไม่รวมไบต์ของภาพ: ข้อมูลพิกเซลที่บีบอัดมีไบต์ 0x40 (@) โผล่แบบสุ่มเสมอ ค้นรวมแล้วแดงหลอก (เจอจริงรอบแรก)
       ข้อความใน PNG อยู่ได้แค่ในก้อนข้อความเท่านั้น จึงค้นครบทุกที่ที่ของลับจะไปอยู่ได้"""
    out, i = [], 8
    while i + 8 <= len(png):
        n, = struct.unpack(">I", png[i:i + 4]); t = png[i + 4:i + 8]; d = png[i + 8:i + 8 + n]
        try:
            if t == b"tEXt": out.append(urllib.parse.unquote(d.split(b"\0", 1)[1].decode("latin-1")))
            elif t == b"zTXt": out.append(urllib.parse.unquote(zlib.decompress(d.split(b"\0", 1)[1][1:]).decode("latin-1")))
            elif t == b"iTXt":
                k, rest = d.split(b"\0", 1); flag = rest[0]; body = rest[2:].split(b"\0", 2)[-1]
                out.append((zlib.decompress(body) if flag else body).decode("utf-8", "replace"))
        except Exception:
            pass
        i += 12 + n
    for x in list(out):
        for dg in re.findall(r"<diagram[^>]*>([^<]+)</diagram>", x):
            try: out.append(urllib.parse.unquote(zlib.decompress(base64.b64decode(dg), -15).decode("utf-8", "replace")))
            except Exception: pass
    return "\n".join(out)


def leaks(hay):
    return [s for s in SECRETS if s in hay]


def backwards_edges(xml):
    """เส้นที่เสียบกล่องปลายทางจากด้านที่หันหนีต้นทาง (ปลายทางอยู่ข้างล่างแต่เสียบก้น หรือออกจากหัวต้นทาง) = เส้นทะลุกล่อง"""
    cells = {}
    for m in re.finditer(r'(<UserObject\b[^>]*>)\s*(<mxCell\b[^>]*>)\s*(<mxGeometry\b[^>]*>)?|(<mxCell\b[^>]*>)\s*(<mxGeometry\b[^>]*>)?', xml):
        uo, cell, geo = (m.group(1), m.group(2), m.group(3)) if m.group(1) else ("", m.group(4), m.group(5))
        a = lambda tag, k: (re.search(r'\s%s="([^"]*)"' % k, tag or "") or [None, None])[1]
        cid = a(uo or cell, "id")
        cells[cid] = dict(mid=a(uo, "mermaidId") or cid, parent=a(cell, "parent"), src=a(cell, "source"), tgt=a(cell, "target"),
                          edge='edge="1"' in cell, style=a(cell, "style") or "", x=float(a(geo, "x") or 0), y=float(a(geo, "y") or 0),
                          h=float(a(geo, "height") or 0))

    def absy(c):
        y, p = c["y"], cells.get(c["parent"])
        while p and p["parent"] not in (None, "0"): y += p["y"]; p = cells.get(p["parent"])
        return y
    bad = []
    for c in cells.values():
        if not c["edge"] or c["src"] not in cells or c["tgt"] not in cells: continue
        s, t = cells[c["src"]], cells[c["tgt"]]
        k = dict(kv.split("=", 1) for kv in c["style"].split(";") if "=" in kv)
        if absy(t) >= absy(s) + s["h"] - 1 and (float(k.get("entryY", 0)) > 0.5 or float(k.get("exitY", 1)) < 0.5):
            bad.append(f'{s["mid"]} -> {t["mid"]} exitY={k.get("exitY")} entryY={k.get("entryY")}')
    return bad


def titles_over_edges(xml):
    """ชื่อกรอบต้องบังเส้น (v157 แบบ ข): ทุกเส้นอยู่ก่อนกรอบที่มีตัวแม่เดียวกันในลำดับ XML (draw.io วาดตามลำดับ)
    กรอบไม่มีสีพื้น และชื่อกรอบมีพื้นหลังสีหน้ากระดาษ  คืนรายการที่ผิด (ว่าง = ผ่าน)"""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml).find(".//root")
    except Exception:
        return ["อ่าน XML ไม่ได้"]
    info = []
    for el in list(root):
        c = el if el.tag == "mxCell" else el.find("mxCell")
        if c is None: continue
        info.append((el.get("id"), c.get("parent"), c.get("edge") == "1",
                     el.tag == "UserObject" and (el.get("mermaidId") or "").startswith("n:g"), c.get("style") or "", el.get("label") or ""))
    bad = []
    for i, (gid, gpar, _, isg, st, lab) in enumerate(info):
        if not isg: continue
        if "fillColor=none" not in st or "labelBackgroundColor=default" not in st: bad.append(f"กรอบ {lab[:20]} สไตล์ไม่บังเส้น")
        bad += [f"เส้น {eid} อยู่หลังกรอบ {lab[:20]}" for j, (eid, epar, ise, _, _, _) in enumerate(info) if ise and epar == gpar and j > i]
    return bad


def boxes(pg, text, view="all"):
    """กล่องกับกรอบที่ผังควรมี คิดด้วยโมดูลตัวเดียวกับหน้าเว็บ"""
    return pg.evaluate("""async ([t, v]) => { const { parsePA, applyView } = await import('./src/parse-pa.js'); const r = parsePA(t);
        if (!r.model) return null; const m = applyView(r.model, v); return [...m.nodes.map((n) => n.text), ...m.groups.map((g) => g.title)]; }""", [text, view])


def paste(pg, text):
    pg.evaluate("""(x) => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); const dt = new DataTransfer(); dt.setData('text/plain', x);
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", text)


def pressed(pg): return pg.evaluate("() => document.querySelector('#types [aria-pressed=true]').dataset.kind")


def ready(pg): pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready'", timeout=60000)


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        if SELFTEST:
            return selftest(b)
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "/flow/"); ready(pg)

        print("\n━━ หน้า Power Automate กับตัวอย่าง ━━")
        pg.click("#types [data-kind=pa]")
        sample = pg.input_value("#src")
        want = boxes(pg, sample)
        got = drawn(pg, want)
        ck(f"กดปุ่ม Power Automate ได้ผังตัวอย่างครบ {len(want)} กล่องกับกรอบ", bool(want) and got == sorted(want), str(got))
        ck("ช่องพิมพ์ใช้ฟอนต์ความกว้างเท่ากัน (อ่าน JSON ง่าย) ทั้งช่องพิมพ์และชั้นแถบสีข้างใต้",
           pg.evaluate("() => { const a = getComputedStyle(document.querySelector('#src')), b = getComputedStyle(document.querySelector('#hl'));"
                       " return /mono|Consolas|Menlo/i.test(a.fontFamily) && a.font === b.font; }"))
        ck("ข้อความใต้ช่องพิมพ์บอกว่าวางอะไรได้ และค่าในแอ็กชันถูกตัดทิ้ง", "definition.json" in pg.inner_text("#hint") and "ตัดทิ้ง" in pg.inner_text("#hint"))
        xml = drawio_xml(preview_png(pg)) or ""
        ck("‼️ ผังที่มีกรอบซ้อน ไม่มีเส้นไหนเสียบกล่องจากด้านที่หันหนี (เส้นไม่ทะลุกล่อง)", xml and not backwards_edges(xml), str(backwards_edges(xml)))
        ck("ตัวเริ่ม flow กับ Terminate เป็นแคปซูล (rounded=1)", len(re.findall(r'<UserObject[^>]*label="(?:ทุกวัน 8 โมงเช้า|จบแบบล้มเหลว)"[^>]*>\s*<mxCell[^>]*rounded=1', xml)) == 2)
        pg.screenshot(path=str(SHOTS / "pa-sample.png"))

        print("\n━━ ‼️ วาง flow ที่มีของลับ ━━")
        raw = (FX / "secrets.json").read_text(encoding="utf-8")
        ck("ไฟล์ทดสอบมีของลับครบทุกชนิดจริง (ตัวค้นมีของให้เจอ)", len(leaks(raw)) == len(SECRETS))
        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
        paste(pg, raw)
        ck("วาง JSON ของ flow ขณะอยู่หน้าขั้นตอน สลับไปหน้า Power Automate ให้เอง", pressed(pg) == "pa", pressed(pg))
        box = pg.input_value("#src")
        ck("‼️ ช่องพิมพ์ไม่มีของลับ (ตัดทิ้งตั้งแต่ตอนวาง)", not leaks(box) and "Call_webhook" in box, str(leaks(box)))
        want = boxes(pg, box)
        got = drawn(pg, want)
        ck(f"ได้ผัง {len(want)} กล่องตามโครงของ flow", bool(want) and got == sorted(want), str(got))
        png = preview_png(pg)
        ck("‼️ PNG ทั้งไฟล์ (รวม XML ที่ฝังไว้) ไม่มีของลับ", bool(drawio_xml(png)) and not leaks(png_texts(png)), str(leaks(png_texts(png))))
        store = pg.evaluate("() => JSON.stringify(sessionStorage)")
        ck("‼️ sessionStorage ไม่มีของลับ", "Call_webhook" in store and not leaks(store), str(leaks(store)))
        with pg.expect_download() as d:
            pg.click("#dl")
        ck("ชื่อไฟล์ที่ดาวน์โหลดมาจากชื่อ flow", d.value.suggested_filename == "แจ้งเตือนสัญญาใกล้หมด.drawio.png", d.value.suggested_filename)
        ck("ไม่มีตัวเลือกย่อกลุ่มเมื่อ flow ไม่มีกรอบ", pg.is_hidden("#paview"))
        pg.focus("#src"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
        ck("กด Ctrl+Z ในช่องพิมพ์ ได้ข้อความก่อนวางคืน", "Call_webhook" not in pg.input_value("#src"))

        print("\n━━ ย่อกลุ่ม กับ ดูทีละกรอบ ━━")
        pg.evaluate("(t) => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, t); }", sample)
        drawn(pg, boxes(pg, sample))
        opts = pg.eval_on_selector_all("#pa-sel option", "els => els.map((e) => [e.value, e.textContent])")
        ck("ตัวเลือกครบ ทั้ง flow , ย่อกลุ่ม , ข้างในทีละกรอบ", [v for v, _ in opts][:2] == ["all", "collapse"] and len(opts) == 5, str(opts))
        pg.select_option("#pa-sel", "collapse")
        want = boxes(pg, sample, "collapse")
        got = drawn(pg, want)
        ck(f"ย่อกลุ่มแล้วเหลือ {len(want)} กล่อง บอกจำนวนขั้นในกล่อง", got == sorted(want) and any("| 6 ขั้น" in t for t in got), str(got))
        pg.screenshot(path=str(SHOTS / "pa-collapse.png"))
        loop = next(v for v, t in opts if "For each item" in t)
        pg.select_option("#pa-sel", loop)
        want = boxes(pg, sample, loop)
        got = drawn(pg, want)
        ck("ดูข้างในกรอบวน ได้ผังแยกเฉพาะของข้างใน", got == sorted(want) and len(got) == 2, str(got))
        with pg.expect_download() as d:
            pg.click("#dl")
        ck("ดาวน์โหลดผังข้างในกรอบ ชื่อไฟล์เป็นชื่อกรอบ", d.value.suggested_filename == "วนทีละรายการ For each item.drawio.png", d.value.suggested_filename)
        pg.select_option("#pa-sel", "all")
        ck("กลับมาดูทั้ง flow ได้", drawn(pg, boxes(pg, sample)) == sorted(boxes(pg, sample)))

        print("\n━━ ไฟล์ .json กับข้อผิดพลาด ━━")
        pg.set_input_files("#filein", str(FX / "nested3.json"))
        pg.wait_for_function("() => document.querySelector('#src').value.includes('For_each_file')", timeout=10000)
        box = pg.input_value("#src")
        want = boxes(pg, box)
        got = drawn(pg, want)
        ck("เลือกไฟล์ definition .json ได้ผังกรอบซ้อน 3 ชั้นครบ", got == sorted(want) and len(want) == 12, str(got))
        xml = drawio_xml(preview_png(pg)) or ""
        ck("‼️ กรอบซ้อน 3 ชั้น ไม่มีเส้นทะลุกล่อง", xml and not backwards_edges(xml), str(backwards_edges(xml)))
        ck("‼️ ชื่อกรอบทุกชั้นบังเส้นที่ลอดใต้ (เส้นอยู่ก่อนกรอบ กรอบไม่มีสีพื้น ชื่อมีพื้นหลัง) ไม่มีเส้นทับชื่อกรอบ",
           xml.count('mermaidId="n:g') == 4 and not titles_over_edges(xml), str(titles_over_edges(xml)[:3]))
        pg.screenshot(path=str(SHOTS / "pa-nested3.png"))
        broken = box.replace('"type": "Scope",', '"type": "Scope"', 1)
        pg.evaluate("(t) => { const ta = document.querySelector('#src'); ta.focus(); ta.select(); document.execCommand('insertText', false, t); }", broken)
        pg.wait_for_selector("#msg .err", timeout=5000)
        line = next(i for i, l in enumerate(broken.split("\n"), 1) if '"type": "Scope"' in l and not l.rstrip().endswith(","))
        err = pg.inner_text("#msg .err")
        ck("JSON ผิด บอกบรรทัดที่ผิดพร้อมวิธีแก้ และมีปุ่มไปที่บรรทัดนั้น", (f"บรรทัด {line}" in err or f"บรรทัด {line + 1}" in err) and pg.locator("#msg .go").count() == 1, err[:120])
        ck("ผังเดิมยังเห็นจาง ๆ ระหว่างแก้", state(pg) == "stale")
        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
        paste(pg, '{ "name": "รายชื่อ", "type": "person" }')
        ck("วาง JSON ทั่วไปที่ไม่ใช่ flow ในหน้าขั้นตอน ไม่ถูกดึงไปหน้า Power Automate", pressed(pg) == "steps")
        pg.click("#types [data-kind=pa]"); pg.wait_for_timeout(200)
        pg.click("#openai"); pg.wait_for_timeout(300)
        ck("กดให้ AI ช่วยร่างจากหน้า Power Automate สลับไปหน้าขั้นตอน (AI ร่างเป็นข้อความ)", pressed(pg) == "steps" and pg.evaluate("() => document.querySelector('#dlg-ai').open"))
        pg.keyboard.press("Escape")
        ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
        ctx.close()

        print("\n━━ หน้าภาษาอังกฤษ ธีมมืด และจอมือถือ ━━")
        ctx = b.new_context(viewport={"width": 1280, "height": 860}, color_scheme="dark")
        ctx.add_init_script("try { localStorage.setItem('fk-lang', 'en') } catch (e) {}")
        pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
        pg.click("#types [data-kind=pa]")
        en = pg.input_value("#src")
        want = boxes(pg, en)
        got = drawn(pg, want)
        ck("หน้าอังกฤษ: ผังตัวอย่างครบ กรอบวนไม่เติมคำซ้ำ (For each item)", got == sorted(want) and "For each item" in got, str(got))
        xml = drawio_xml(preview_png(pg)) or ""
        words = {html.unescape(re.sub(r"<[^>]+>", "", v)).strip() for v in re.findall(r'\s(?:value|label)="([^"]*)"', xml)}
        ck("หน้าอังกฤษ: ป้ายเส้นเป็นภาษาอังกฤษ (Yes , No , if it fails) ไม่มีป้ายไทยหลง", {"Yes", "No", "if it fails"} <= words and not {"ใช่", "ไม่ใช่", "ถ้าพัง"} & words,
           str(sorted(w for w in words if len(w) < 14)))
        pg.screenshot(path=str(SHOTS / "pa-en-dark.png"))
        ctx.close()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
        pg.click("#types [data-kind=pa]")
        drawn(pg, boxes(pg, pg.input_value("#src")))
        ck("จอมือถือ: ปุ่มชนิดผัง 5 ปุ่มไม่ดันหน้าให้เลื่อนข้าง", pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth"))
        pg.screenshot(path=str(SHOTS / "pa-mobile.png"), full_page=False)
        ctx.close()
        b.close()
    return finish()


def selftest(b):
    print("\n━━ selftest ━━")
    ctx = b.new_context(); pg = ctx.new_page(); pg.goto(BASE + "/flow/"); ready(pg)
    png = preview_png(pg)
    key = b"tEXt"; body = b"note\0" + urllib.parse.quote("to secret.person@example.com").encode()
    chunk = struct.pack(">I", len(body)) + key + body + struct.pack(">I", zlib.crc32(key + body) & 0xffffffff)
    planted = png[:-12] + chunk + png[-12:]
    ck("ตัวค้นเจออีเมลที่แอบใส่ไว้ใน PNG", "@" in png_texts(planted) and not leaks(png_texts(png)))
    xml = drawio_xml(png) or ""
    ck("ตัวตรวจเส้นไม่ฟ้องผังปกติ", xml and not backwards_edges(xml), str(backwards_edges(xml)))
    # ‼️ ต้องแก้ใน style ของ mxCell ที่เป็นเส้น (สำเนาใน mermaidBaseStyle ของ UserObject ไม่มีผลกับภาพ แก้ตรงนั้นแล้วตัวตรวจไม่เห็น ถูกต้องแล้ว)
    first = re.search(r'<mxCell\b[^>]*\bedge="1"[^>]*entryY=0;[^>]*>', xml)
    bad = xml.replace(first.group(0), first.group(0).replace("entryY=0;", "entryY=1;", 1), 1) if first else xml
    ck("ตัวตรวจเส้นจับเส้นที่เสียบก้นกล่องที่อยู่ข้างล่างได้", bad != xml and len(backwards_edges(bad)) == 1, str(backwards_edges(bad)))
    # ตัวตรวจชื่อกรอบ: ผังจริงที่มีกรอบต้องผ่าน , ย้ายเส้นไปท้ายสุด (ลำดับแบบเดิมก่อน v157) หรือใส่สีพื้นกรอบคืน ต้องถูกฟ้อง
    pg.click("#types [data-kind=pa]"); pg.wait_for_timeout(1500); ready(pg); pg.wait_for_timeout(800)
    gx = drawio_xml(preview_png(pg)) or ""
    ck("ตัวตรวจชื่อกรอบไม่ฟ้องผัง Power Automate ปกติ (มีกรอบให้ตรวจจริง)", 'mermaidId="n:g' in gx and not titles_over_edges(gx), str(titles_over_edges(gx)[:2]))
    e = re.search(r'<UserObject\b[^>]*mermaidId="e:[^"]*"[^>]*>[\s\S]*?</UserObject>', gx)
    late = gx.replace(e.group(0), "", 1).replace("</root>", e.group(0) + "</root>", 1) if e else gx
    # ‼️ แก้ที่ style ของ mxCell ในกรอบ (fillColor=none ตัวแรกในข้อความอยู่ใน mermaidBaseStyle ซึ่งไม่มีผลกับภาพ แก้ตรงนั้นแล้วตัวตรวจไม่เห็น ถูกต้องแล้ว)
    gray = re.sub(r'(<UserObject\b[^>]*mermaidId="n:g\d+"[^>]*>\s*<mxCell\b[^>]*\sstyle="[^"]*?)fillColor=none', r"\1fillColor=#f6f5f3", gx, count=1)
    ck("ตัวตรวจชื่อกรอบจับเส้นที่อยู่หลังกรอบ และกรอบที่มีสีพื้นได้", gray != gx and bool(titles_over_edges(late)) and bool(titles_over_edges(gray)),
       f"late {titles_over_edges(late)[:1]} gray {titles_over_edges(gray)[:1]}")
    b.close()
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจจับของลับกับเส้นทะลุกล่องได้" if SELFTEST else "✅ วาง flow ของ Power Automate แล้วได้ผังที่ใช้ได้จริง ไม่มีของลับติดไปในไฟล์")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
