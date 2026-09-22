# FlowKit หน้าวาดผัง: ผู้ใช้พิมพ์ข้อความแล้วได้ไฟล์ผังที่ใช้ได้จริงไหม (แผน FlowKit เฟส 2 ข้อ "browser_flowkit.py")
#
# ‼️ ทุกข้อถามของที่ผู้ใช้ได้จริง ไม่ใช่ถามว่ามี element ครบ
#    อ่าน PNG ที่หน้าเว็บวาด แกะ XML ของ draw.io ที่ฝังอยู่ข้างใน แล้วนับกล่องกับอ่านข้อความไทยทีละกล่อง
#    ไฟล์ที่ดาวน์โหลดต้องเป็นภาพเดียวกับบนจอทุกไบต์ (เห็นแบบไหน ได้แบบนั้น)
# ‼️ ต้องต่อเน็ตได้ (draw.io โหลดจาก embed.diagrams.net ตามที่พี่ปอนด์เคาะ W1) ต่อไม่ได้ = แดง ไม่ใช่ข้าม
#
# --selftest ป้อนของผิดให้ตัวตรวจทีละตัว แล้วตัวตรวจต้องจับได้ (ตัวตรวจที่ไม่เคยแดงเชื่อไม่ได้)

import sys, os, re, json, base64, hashlib, struct, html, urllib.parse, tempfile, shutil, pathlib, traceback
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
URL = BASE + "/flow/"
SELFTEST = "--selftest" in sys.argv
MARK = "ลับเฉพาะFK7731"        # ข้อความที่เทสพิมพ์ลงผัง ต้องไม่โผล่ในคำขอใด ๆ ที่ออกจากหน้า
TMP = None                      # สร้างตอนรันจริงเท่านั้น (browser_flowgolden.py import ตัวช่วยจากไฟล์นี้ ต้องไม่ทิ้งโฟลเดอร์ว่างไว้)
READY_MS = 60000

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


# ── ตัวอ่านไฟล์ผล ───────────────────────────────────────────────────────────
def drawio_xml(png: bytes):
    """XML ของ draw.io ที่ฝังใน PNG (chunk tEXt ชื่อ mxfile เข้ารหัสแบบ URL) ไม่มี = None"""
    if png[:8] != b"\x89PNG\r\n\x1a\n": return None
    i = 8
    while i + 8 <= len(png):
        n, = struct.unpack(">I", png[i:i + 4]); t = png[i + 4:i + 8]; d = png[i + 8:i + 8 + n]
        if t == b"tEXt" and b"\0" in d:
            key, val = d.split(b"\0", 1)
            if key == b"mxfile": return urllib.parse.unquote(val.decode("latin-1"))
        i += 12 + n
    return None


def cells(xml):
    """กล่อง (vertex) ทุกกล่องใน XML: [(ข้อความที่ตาเห็น, style)]
    ‼️ กล่องจาก Mermaid เป็น UserObject ที่มี mxCell อยู่ข้างใน ต้องนับครั้งเดียว (เคยนับซ้ำเป็นกล่องว่างจนเทสแดงหลอก)"""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml)
    except Exception:
        return []
    out = []
    for g in root.iter("root"):
        for el in g:
            cell = el if el.tag == "mxCell" else el.find("mxCell")
            if cell is None or cell.get("vertex") != "1": continue
            raw = el.get("label") if el.tag == "UserObject" else el.get("value")
            # ขึ้นบรรทัดใหม่ในกล่องมาได้ทั้ง <br> และตัวขึ้นบรรทัดจริง (draw.io เก็บแบบหลังเมื่อแปลงจาก Mermaid)
            text = re.sub(r"<br\s*/?>", " | ", raw or "")
            text = html.unescape(re.sub(r"<[^>]+>", "", text))
            text = " | ".join(x.strip() for x in text.split("\n") if x.strip())
            out.append((text, cell.get("style") or ""))
    return out


def fonts(xml):
    return sorted(set(re.findall(r"fontFamily=([^;\"]*)", xml)))


def css_check_colors(xml):
    """สีตั้งต้นของ Mermaid (ม่วง) ต้องไม่มี"""
    return not re.search(r"#ECECFF|#9370DB", xml, re.I)


# ── ตัวช่วยบนหน้า ──────────────────────────────────────────────────────────
def state(pg): return pg.evaluate("() => document.querySelector('#canvas').dataset.state")


def wait_ready(pg, before_src=None, ms=READY_MS):
    """รอผังรอบใหม่วาดเสร็จ (ถ้าให้ before_src มา ต้องเป็นภาพคนละใบกับเดิม)"""
    pg.wait_for_function("""(prev) => { const c = document.querySelector('#canvas'), i = document.querySelector('#png');
        return c.dataset.state === 'ready' && !i.hidden && i.naturalWidth > 0 && i.currentSrc !== prev
          && !document.querySelector('#live').hasAttribute('data-busy'); }""", arg=before_src or "", timeout=ms)


def img_src(pg): return pg.evaluate("() => document.querySelector('#png').currentSrc")


def drawn(pg, want, ms=READY_MS):
    """รอจนผังบนจอมีกล่องตรงกับที่คาด (เรียงแล้วเทียบ) คืนรายการข้อความที่เห็นรอบสุดท้าย
    ‼️ ไม่รอ "ภาพใบใหม่" เฉย ๆ เพราะระหว่างพิมพ์อาจวาดรอบกลางทางไปก่อนแล้ว ถามผลสุดท้ายตรง ๆ แทน"""
    want = sorted(want); last = None; waited = 0
    while waited <= ms:
        if state(pg) == "ready" and not pg.evaluate("() => document.querySelector('#live').hasAttribute('data-busy')"):
            last = sorted(t for t, _ in cells(drawio_xml(preview_png(pg)) or ""))
            if last == want: return last
        pg.wait_for_timeout(500); waited += 500
    return last


def preview_png(pg) -> bytes:
    b64 = pg.evaluate("""async () => { const b = await (await fetch(document.querySelector('#png').currentSrc)).arrayBuffer();
        let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(s); }""")
    return base64.b64decode(b64)


def set_text(pg, text):
    """แทนข้อความทั้งช่องแบบที่ผู้ใช้วาง (ยิง input event จริง) แล้วรอผังรอบใหม่"""
    before = img_src(pg)
    pg.evaluate("""(t) => { const ta = document.querySelector('#src'); ta.focus(); ta.select();
        document.execCommand('insertText', false, t); }""", text)
    return before


def mark_offset(pg):
    """แถบสีห่างจากกึ่งกลางบรรทัดที่ผิดในช่องพิมพ์กี่ px (คิดจากตำแหน่งบรรทัดจริงของช่องพิมพ์ หลังเลื่อนแล้ว)"""
    return pg.evaluate("""() => {
      const ta = document.querySelector('#src'), m = document.querySelector('#hl mark');
      if (!m) return null;
      const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight), pt = parseFloat(cs.paddingTop);
      const line = Number(document.querySelector('#msg .err b').textContent.match(/\\d+/)[0]);
      const r = m.getClientRects()[0], t = ta.getBoundingClientRect();
      const want = t.top + pt + (line - 0.5) * lh - ta.scrollTop;
      return Math.round(((r.top + r.bottom) / 2 - want) * 10) / 10; }""")


def main():
    global TMP
    TMP = pathlib.Path(tempfile.mkdtemp(prefix="fk_flow_"))
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        if SELFTEST:
            return selftest(b)

        # ── ก. เปิดครั้งแรกแบบเย็น ─────────────────────────────────────────
        print("\n━━ ก. เปิดครั้งแรก (ไม่มีอะไรค้างในเครื่อง) ━━")
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        reqs, ws, csp, errs = [], [], [], []
        ctx.on("request", lambda r: reqs.append((r.method, r.url, r.post_data or "")))
        pg = ctx.new_page()
        pg.on("websocket", lambda w: ws.append(w.url))
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and (m.location or {}).get("url", "").startswith(BASE) else None)
        pg.add_init_script("document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI) })")
        pg.goto(URL)
        first_line = pg.evaluate("() => document.querySelector('#src').value.split('\\n')[0]")
        ck("เปิดหน้าแล้วมีตัวอย่างในช่องพิมพ์ ไม่ใช่ช่องว่าง", first_line == "ลูกค้าแจ้งเรื่อง", f"บรรทัดแรก {first_line!r}")
        try:
            wait_ready(pg); ok = True
        except Exception:
            ok = False
        ck("ผังตัวอย่างวาดเสร็จเองโดยไม่ต้องกดอะไร", ok, f"สถานะ {state(pg)} ข้อความ {pg.evaluate('() => document.querySelector(\"#cvmsg\").textContent')!r}")
        if not ok:
            return finish()
        png = preview_png(pg)
        xml = drawio_xml(png)
        ck("ภาพบนจอเป็น PNG ที่ฝังผัง draw.io ไว้ข้างใน (เปิดแก้ต่อได้)", bool(xml))
        xml = xml or ""
        got = [t for t, _ in cells(xml)]
        want = ["ลูกค้าแจ้งเรื่อง", "Call Center รับเรื่อง", "แก้ได้เองไหม?", "ปิดงาน", "ส่งช่างหน้างาน", "ช่างปิดงาน"]
        ck("ในไฟล์มีกล่องครบ 6 กล่อง ข้อความไทยตรงทุกกล่อง", sorted(got) == sorted(want), f"ได้ {got}")
        ck("ฟอนต์ในไฟล์เป็น Sarabun ทุกกล่อง", fonts(xml) == ["Sarabun"], f"ได้ {fonts(xml)}")
        ck("สีเป็นขาวเทาของเรา ไม่ใช่ม่วงตั้งต้นของ Mermaid (เส้นเทา #8a8f98 ทุกกล่อง)", css_check_colors(xml)
           and all("strokeColor=#8a8f98" in st for _, st in cells(xml)), str(sorted(set(re.findall(r"strokeColor=([^;\"]*)", xml)))))
        shape = {t: s for t, s in cells(xml)}
        ck("คำถามเป็นข้าวหลามตัด จุดเริ่มกับจุดจบเป็นแคปซูล", "rhombus" in shape.get("แก้ได้เองไหม?", "")
           and "rounded=1" in shape.get("ลูกค้าแจ้งเรื่อง", "") and "rounded=1" in shape.get("ช่างปิดงาน", ""),
           f"คำถาม {shape.get('แก้ได้เองไหม?', '')[:60]!r} เริ่ม {shape.get('ลูกค้าแจ้งเรื่อง', '')[:60]!r}")
        ck("ปุ่มดาวน์โหลดกดได้เมื่อผังพร้อม", pg.is_enabled("#dl"))
        alt = pg.get_attribute("#png", "alt")
        ck("ภาพผังมีคำอธิบายให้โปรแกรมอ่านหน้าจอ", bool(alt) and "6" in alt, f"alt {alt!r}")

        # ── ข. ชนิดผังอื่น ────────────────────────────────────────────────
        print("\n━━ ข. ชนิดผังอื่น ━━")
        SAMPLE_BOXES = {
            "org": ["ผู้อำนวยการ", "ผู้จัดการฝ่ายขาย", "ทีมขายภาคเหนือ", "ทีมขายภาคใต้", "ผู้จัดการฝ่ายบัญชี", "ทีมบัญชีเจ้าหนี้"],
            "system": ["ลูกค้า", "เว็บไซต์", "ระบบชำระเงิน", "คลังสินค้า"],
            "timeline": ["สัปดาห์ 1 | เก็บความต้องการ", "สัปดาห์ 2 | ออกแบบหน้าจอ", "สัปดาห์ 3 | ลงมือทำ | ทดสอบกับผู้ใช้", "สัปดาห์ 4 | ส่งมอบ"],
        }
        for kind, want in SAMPLE_BOXES.items():
            pg.click(f"#types [data-kind={kind}]")
            got = drawn(pg, want)
            ck(f"[{kind}] กดแล้วได้ตัวอย่างของชนิดนั้น วาดครบ {len(want)} กล่อง ข้อความตรงทุกกล่อง", got == sorted(want), f"ได้ {got}")
            ck(f"[{kind}] ปุ่มชนิดที่เลือกอยู่บอกสถานะให้โปรแกรมอ่านหน้าจอ",
               pg.get_attribute(f"#types [data-kind={kind}]", "aria-pressed") == "true")
        pg.click("#types [data-kind=steps]")
        drawn(pg, want)
        set_text(pg, "เริ่ม\nตรวจเอกสาร\nเสร็จ")
        pg.wait_for_timeout(700)
        pg.click("#types [data-kind=org]"); pg.wait_for_timeout(300)
        pg.click("#types [data-kind=steps]"); pg.wait_for_timeout(300)
        ck("สลับชนิดผังไปแล้วกลับมา ข้อความที่พิมพ์ไว้ยังอยู่", pg.input_value("#src") == "เริ่ม\nตรวจเอกสาร\nเสร็จ", repr(pg.input_value("#src")))

        # ── ค. พิมพ์จริงด้วยคีย์บอร์ด ─────────────────────────────────────────
        print("\n━━ ค. พิมพ์ด้วยคีย์บอร์ด ━━")
        pg.fill("#src", "")
        pg.click("#src")
        pg.keyboard.type("เริ่ม"); pg.keyboard.press("Enter")
        pg.keyboard.type("ผ่านไหม?"); pg.keyboard.press("Enter")
        v = pg.input_value("#src")
        ck("Enter หลังคำถาม ย่อหน้าบรรทัดใหม่ให้เอง", v == "เริ่ม\nผ่านไหม?\n  ", repr(v))
        pg.keyboard.type("ผ่าน: ปิดงาน"); pg.keyboard.press("Enter")
        v = pg.input_value("#src")
        ck("Enter บนกิ่ง ต่อบรรทัดด้วยย่อหน้าเดิม", v.endswith("ผ่าน: ปิดงาน\n  "), repr(v[-20:]))
        pg.keyboard.type("ไม่ผ่าน: แก้เอกสาร"); pg.keyboard.press("Enter"); pg.keyboard.press("Enter")
        v = pg.input_value("#src")
        ck("Enter บนบรรทัดว่างที่ย่อหน้าอยู่ ถอยกลับระดับหลัก", v.endswith("แก้เอกสาร\n"), repr(v[-20:]))
        pg.keyboard.type("ส่งต่อ")
        pg.keyboard.press("Tab")
        v = pg.input_value("#src")
        ck("Tab ย่อหน้าบรรทัดที่เคอร์เซอร์อยู่ และโฟกัสยังอยู่ในช่องพิมพ์",
           v.endswith("\n  ส่งต่อ") and pg.evaluate("() => document.activeElement.id") == "src", repr(v[-12:]))
        pg.keyboard.press("Shift+Tab")
        ck("Shift+Tab ถอยออก", pg.input_value("#src").endswith("\nส่งต่อ"), repr(pg.input_value("#src")[-12:]))
        pg.keyboard.press("Tab"); pg.keyboard.press("Control+z")
        ck("Ctrl+Z ย้อนการย่อหน้าได้ (แทรกผ่าน insertText ไม่ใช่ตั้งค่าตรง ๆ)", pg.input_value("#src").endswith("\nส่งต่อ"), repr(pg.input_value("#src")[-12:]))
        pg.keyboard.press("Escape"); pg.keyboard.press("Tab")
        ck("กด Esc แล้ว Tab ออกจากช่องพิมพ์ได้ (คนใช้คีย์บอร์ดไม่ติดอยู่ในช่อง)", pg.evaluate("() => document.activeElement.id") != "src")
        want = ["เริ่ม", "ผ่านไหม?", "ปิดงาน", "แก้เอกสาร", "ส่งต่อ"]
        got = drawn(pg, want)
        ck("ข้อความที่พิมพ์ด้วยคีย์บอร์ดกลายเป็นผังที่ถูกต้อง", got == sorted(want), f"ได้ {got}")

        # ── ง. ข้อผิดพลาด ────────────────────────────────────────────────
        print("\n━━ ง. เขียนผิด ━━")
        src_ok = img_src(pg)
        set_text(pg, "เริ่มงาน\n  ย่อหน้าผิดที่\nจบงานนี้")
        pg.wait_for_selector("#msg .err", timeout=5000)
        err = pg.inner_text("#msg .err")
        ck("ข้อผิดพลาดบอกเลขบรรทัด บอกว่าผิดอะไร และบอกวิธีแก้", "บรรทัด 2" in err and pg.locator("#msg .err .fix").count() == 1, repr(err))
        off = mark_offset(pg)
        ck("แถบสีอยู่ตรงบรรทัดที่ผิดพอดี (คลาดไม่เกิน 4px)", off is not None and abs(off) <= 4, f"คลาด {off}px")
        ck("ระหว่างมีข้อผิดพลาด ปุ่มดาวน์โหลดกดไม่ได้ (กันได้ไฟล์ผังเก่า)", not pg.is_enabled("#dl"))
        ck("ผังเดิมยังเห็นจาง ๆ พร้อมบอกว่าต้องแก้บรรทัดไหน", state(pg) == "stale" and "บรรทัด 2" in pg.inner_text("#cvmsg"), f"สถานะ {state(pg)}")
        pg.click("#msg .go")
        sel = pg.evaluate("() => { const ta = document.querySelector('#src'); return ta.value.slice(0, ta.selectionStart).split('\\n').length }")
        ck("กด ไปที่บรรทัดนี้ แล้วเคอร์เซอร์ไปอยู่บรรทัดที่ผิด", sel == 2 and pg.evaluate("() => document.activeElement.id") == "src", f"อยู่บรรทัด {sel}")
        long_text = "\n".join(f"ขั้นที่ {i}" for i in range(1, 40)) + "\n  ย่อหน้าผิดที่\nขั้นสุดท้าย"
        set_text(pg, long_text)
        pg.wait_for_function("() => /40/.test(document.querySelector('#msg .err b')?.textContent || '')", timeout=5000)
        pg.click("#msg .go")
        pg.wait_for_timeout(200)
        off = mark_offset(pg)
        scrolled = pg.evaluate("() => document.querySelector('#src').scrollTop")
        ck("ข้อความยาวจนต้องเลื่อน แถบสียังตรงบรรทัดที่ผิด", scrolled > 0 and off is not None and abs(off) <= 4, f"เลื่อน {scrolled}px คลาด {off}px")
        set_text(pg, "ชื่อ: แผนต่อสัญญา/ปี 2569\nเริ่มงาน\nตรวจสัญญา\n" + MARK + "\nจบงานนี้")
        got = drawn(pg, ["เริ่มงาน", "ตรวจสัญญา", MARK, "จบงานนี้"])
        ck("แก้แล้วผังกลับมาวาดใหม่ ข้อผิดพลาดหาย ปุ่มกดได้อีก", got == sorted(["เริ่มงาน", "ตรวจสัญญา", MARK, "จบงานนี้"]) and pg.is_enabled("#dl")
           and pg.locator("#msg .err").count() == 0 and pg.locator("#hl mark").count() == 0, f"ได้ {got}")

        # ── จ. ดาวน์โหลด ────────────────────────────────────────────────
        print("\n━━ จ. ดาวน์โหลด ━━")
        with pg.expect_download() as d:
            pg.click("#dl")
        dlf = d.value
        path = TMP / "got.png"; dlf.save_as(str(path))
        data = path.read_bytes()
        ck("ชื่อไฟล์มาจาก ชื่อ: ตัดอักขระที่ชื่อไฟล์ใช้ไม่ได้ ลงท้าย .drawio.png", dlf.suggested_filename == "แผนต่อสัญญา ปี 2569.drawio.png", repr(dlf.suggested_filename))
        ck("ไฟล์ที่ได้ตรงกับภาพบนจอทุกไบต์ (เห็นแบบไหน ได้แบบนั้น)", hashlib.sha256(data).hexdigest() == hashlib.sha256(preview_png(pg)).hexdigest())
        dx = drawio_xml(data) or ""
        ck("ไฟล์ที่ดาวน์โหลดมีผัง draw.io ฝังอยู่ ครบทุกกล่อง", sorted(t for t, _ in cells(dx)) == sorted(["เริ่มงาน", "ตรวจสัญญา", MARK, "จบงานนี้"]),
           f"ได้ {[t for t, _ in cells(dx)]}")

        # ── ฉ. ข้อความไม่ออกจากเครื่อง ─────────────────────────────────────
        print("\n━━ ฉ. ข้อความไม่ออกจากเครื่อง ━━")
        leaks = [r for r in reqs if leaked(r)]
        ck(f"ข้อความที่พิมพ์ไม่อยู่ในคำขอใดเลย (ตรวจ {len(reqs)} คำขอ รวมของ iframe)", not leaks and len(reqs) > 10, f"รั่ว {leaks[:3]}")
        outside = [r for r in reqs if not r[1].startswith(BASE) and not r[1].startswith(("blob:", "data:")) and r[0] != "GET"]
        ck("ไม่มีคำขอแบบส่งข้อมูล (POST หรืออื่น ๆ) ออกนอกเครื่องเลย", not outside, f"{[(m, u[:80]) for m, u, _ in outside[:3]]}")
        ck("ไม่มี WebSocket", not ws, str(ws[:2]))
        hosts = sorted({urllib.parse.urlsplit(u).netloc for _, u, _ in reqs if u.startswith("http") and not u.startswith(BASE)})
        ck("คุยกับภายนอกแค่ draw.io กับฟอนต์ของ Google (ที่ draw.io ใช้วาด Sarabun)",
           set(hosts) <= {"embed.diagrams.net", "fonts.googleapis.com", "fonts.gstatic.com"}, str(hosts))

        # ── ช. ข้อความไม่หาย แต่ก็ไม่ค้าง ────────────────────────────────────
        print("\n━━ ช. รีเฟรช สลับภาษา เปิดแท็บใหม่ ━━")
        mine = pg.input_value("#src")
        pg.reload(); pg.wait_for_timeout(500)
        ck("รีเฟรชแล้วข้อความที่พิมพ์ยังอยู่", pg.input_value("#src") == mine)
        with pg.expect_navigation():
            pg.click("#lang [data-lang=en]")
        pg.wait_for_timeout(500)
        ck("สลับเป็นภาษาอังกฤษ ข้อความที่พิมพ์ยังอยู่ และหน้าเป็นภาษาอังกฤษ",
           pg.input_value("#src") == mine and pg.inner_text("h1") == "Draw a diagram from text", pg.inner_text("h1"))
        try:
            wait_ready(pg); ok = True
        except Exception:
            ok = False
        ck("หน้าอังกฤษวาดผังของข้อความไทยได้ ปุ่มเป็นภาษาอังกฤษ", ok and pg.inner_text("#dl") == "Download diagram image", pg.inner_text("#dl"))
        with pg.expect_navigation():
            pg.click("#lang [data-lang=th]")
        p2 = ctx.new_page(); p2.goto(URL); p2.wait_for_timeout(500)
        ck("เปิดแท็บใหม่ ไม่มีข้อความของรอบก่อนค้าง (เครื่องที่ใช้ร่วมกัน)", p2.input_value("#src").startswith("ลูกค้าแจ้งเรื่อง"))
        p2.close()
        ck("ไม่มี error บนหน้าของเรา (ไม่นับของ draw.io ใน iframe)", not errs, str(errs[:3]))
        viol = pg.evaluate("() => window.__csp || []")
        ck("CSP ของหน้าไม่ต้องบล็อกอะไรเลย", not viol, str(viol[:3]))
        ctx.close()

        # ── ซ. ภาษาอังกฤษตั้งแต่แรก ────────────────────────────────────────
        print("\n━━ ซ. เปิดเป็นภาษาอังกฤษตั้งแต่แรก ━━")
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        ctx.add_init_script("try { localStorage.setItem('fk-lang', 'en') } catch (e) {}")
        pg = ctx.new_page(); pg.goto(URL)
        ck("ตัวอย่างเป็นภาษาอังกฤษ", pg.evaluate("() => document.querySelector('#src').value.split('\\n')[0]") == "Customer reports a problem")
        try:
            wait_ready(pg); x = drawio_xml(preview_png(pg)) or ""
        except Exception:
            x = ""
        ck("ตัวอย่างภาษาอังกฤษวาดครบ 6 กล่อง", len(cells(x)) == 6, str([t for t, _ in cells(x)]))
        thai_left = pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(n => n.children.length === 0 && !n.closest('textarea,.sr')
            && /[\\u0E00-\\u0E7F]/.test(n.textContent) && n.offsetParent !== null && !n.hasAttribute('lang')).map(n => n.textContent.trim()).slice(0, 5)""")
        ck("หน้าอังกฤษไม่มีข้อความไทยหลงบนจอ (นอกจากปุ่มเลือกภาษา)", not thai_left, str(thai_left))
        ctx.close()

        # ── ฌ. หน้าจอ ────────────────────────────────────────────────────
        print("\n━━ ฌ. หน้าจอ ━━")
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        pg = ctx.new_page(); pg.goto(URL); wait_ready(pg)
        bg = pg.evaluate("() => getComputedStyle(document.querySelector('#canvas')).backgroundColor")
        ck("ธีมมืด กระดาษผังยังขาว (ภาพที่ได้ไปวางสไลด์ก็พื้นขาว)", bg == "rgb(255, 255, 255)", bg)
        box = pg.locator("#dl").bounding_box()
        ck("จอใหญ่ ช่องพิมพ์ ผัง และปุ่มดาวน์โหลดอยู่ในจอเดียวโดยไม่ต้องเลื่อน", box and box["y"] + box["height"] <= 900, str(box))
        ctx.close()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        pg = ctx.new_page(); pg.goto(URL); wait_ready(pg)
        sw = pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
        ck("มือถือ ไม่มีเลื่อนข้าง", sw[0] <= sw[1], str(sw))
        inview = lambda: pg.evaluate("() => { const r = document.querySelector('#dl').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }")
        top_ok = inview()
        pg.evaluate("() => window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(300)
        ck("มือถือ ปุ่มดาวน์โหลดอยู่ในจอตลอด ทั้งตอนอยู่บนสุดและเลื่อนลงล่างสุด", top_ok and inview())
        tap = pg.evaluate("() => [...document.querySelectorAll('#types .type, #dl, #lang .langopt, #theme')].map(n => Math.round(n.getBoundingClientRect().height)).filter(h => h < 36)")
        ck("มือถือ ปุ่มทุกตัวสูงพอให้นิ้วกด (อย่างน้อย 36px)", not tap, str(tap))
        ctx.close()

        # ── ญ. ต่อ draw.io ไม่ได้ ──────────────────────────────────────────
        print("\n━━ ญ. ต่อ draw.io ไม่ได้ ━━")
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        ctx.route("https://embed.diagrams.net/**", lambda r: r.abort())
        pg = ctx.new_page(); pg.goto(URL)
        try:
            pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'error'", timeout=20000); shown = True
        except Exception:
            shown = False
        msg_ = pg.inner_text("#cvmsg") if shown else ""
        ck("เว็บ draw.io ถูกบล็อก บอกผู้ใช้ภายใน 20 วินาทีว่าต่อไม่ได้ และบอกว่าโหลดจากไหน", shown and "diagrams.net" in msg_, repr(msg_))
        ck("มีปุ่มลองใหม่ และปุ่มดาวน์โหลดกดไม่ได้", pg.locator("#cvmsg button").count() == 1 and not pg.is_enabled("#dl"))
        ctx.unroute("https://embed.diagrams.net/**")
        pg.click("#cvmsg button")
        try:
            wait_ready(pg); ok = True
        except Exception:
            ok = False
        ck("ปลดบล็อกแล้วกดลองใหม่ ผังขึ้น", ok, f"สถานะ {state(pg)}")
        ctx.close()
        b.close()
    return finish()


def leaked(r):
    method, url, body = r
    hay = url + " " + urllib.parse.unquote(url) + " " + (body or "") + " " + urllib.parse.unquote(body or "")
    return MARK in hay


def selftest(b):
    """ป้อนของผิดให้ตัวตรวจแต่ละตัว ตัวตรวจต้องจับได้ทุกตัว"""
    print("\n━━ selftest: ตัวตรวจต้องจับของผิดได้ ━━")
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    reqs = []
    ctx.on("request", lambda r: reqs.append((r.method, r.url, r.post_data or "")))
    pg = ctx.new_page(); pg.goto(URL); wait_ready(pg)
    png = preview_png(pg)
    xml = drawio_xml(png) or ""
    # ① ตัวตรวจ PNG: ภาพที่ไม่มีผังฝัง
    stripped = strip_text_chunks(png)
    ck("ตัวตรวจ PNG จับภาพที่ไม่มีผัง draw.io ฝังได้", drawio_xml(stripped) is None and bool(xml))
    # ② ตัวตรวจฟอนต์กับสี: XML ก่อนเปลี่ยนฟอนต์ และสีม่วงของ Mermaid
    raw = xml.replace("fontFamily=Sarabun", "fontFamily=Trebuchet MS")
    ck("ตัวตรวจฟอนต์จับกล่องที่ไม่ใช่ Sarabun ได้", fonts(raw) != ["Sarabun"])
    ck("ตัวตรวจสีจับสีม่วงตั้งต้นของ Mermaid ได้", not css_check_colors(xml.replace("fillColor=default", "fillColor=#ECECFF", 1)))
    # ③ ตัวตรวจแถบสี: เลื่อนชั้นแถบลง 1 บรรทัด ต้องจับได้
    set_text(pg, "เริ่มงาน\n  ย่อหน้าผิดที่\nจบงานนี้")
    pg.wait_for_selector("#msg .err", timeout=5000)
    # ‼️ ใส่ <style> ไม่ได้ CSP ของหน้าบล็อก (ดีแล้ว) จึงเลื่อนผ่าน CSSOM แทน
    pg.evaluate("() => { document.querySelector('#hl').style.paddingTop = '42px' }")
    off = mark_offset(pg)
    ck("ตัวตรวจแถบสีจับแถบที่เลื่อนไปทับบรรทัดอื่นได้", off is not None and abs(off) > 4, f"คลาด {off}px")
    # ④ ตัวตรวจข้อความรั่ว: ยิงข้อความของผู้ใช้ออกไปใน URL เอง (เว็บเดียวกัน CSP ยอม) ต้องจับได้
    pg.evaluate("(m) => fetch('/?q=' + encodeURIComponent(m)).catch(() => {})", MARK)
    pg.wait_for_timeout(500)
    ck("ตัวตรวจข้อความรั่วจับข้อความที่ถูกส่งออกไปได้", any(leaked(r) for r in reqs))
    ctx.close(); b.close()
    return finish()


def strip_text_chunks(png):
    out, i = [png[:8]], 8
    while i + 8 <= len(png):
        n, = struct.unpack(">I", png[i:i + 4]); t = png[i + 4:i + 8]
        if t not in (b"tEXt", b"zTXt", b"iTXt"): out.append(png[i:i + 12 + n])
        i += 12 + n
    return b"".join(out)


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจจับของผิดได้ทุกตัว" if SELFTEST else "✅ พิมพ์แล้วได้ผังที่ใช้ได้จริง ไฟล์ตรงกับที่เห็น ข้อความไม่ออกจากเครื่อง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        if TMP: shutil.rmtree(TMP, ignore_errors=True)
