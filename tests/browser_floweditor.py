# FlowKit ห้องแก้ไข (แผนเฟส 3): กดลากแก้ต่อ แก้ในห้อง บันทึกแล้วผังที่ได้คือผังที่แก้จริงไหม
#
# ‼️ ถามของที่ผู้ใช้ได้จริงทุกข้อ: แกะ XML ที่ฝังใน PNG ของพรีวิวกับไฟล์ที่ดาวน์โหลด แล้วนับกล่อง
#    แก้ในห้องด้วยคีย์บอร์ดจริง (เลือกทั้งหมดแล้วลบ) กดปุ่ม "บันทึก และ ออก" ของ draw.io จริง
# ‼️ ข้อที่พลาดแล้วงานผู้ใช้หาย: พิมพ์ข้อความต่อหลังแก้ด้วยมือต้องไม่วาดทับเอง , โหลดหน้าใหม่ต้องได้ผังที่แก้กลับมา ,
#    กด "ออก" (ไม่บันทึก) ผังเดิมต้องไม่เปลี่ยน
# ‼️ ต้องต่อเน็ตได้ (ห้องแก้ไขโหลด draw.io จาก embed.diagrams.net)
#
# --selftest ตัวตรวจต้องเห็นว่าผังที่แก้ต่างจากผังเดิม และเห็นว่าผังถูกวาดทับ

import sys, os, hashlib, pathlib, tempfile, shutil, traceback, base64
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawio_xml, cells, preview_png, set_text, state, edges, one_bus   # ตัวอ่านไฟล์ผลตัวเดียวกัน

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
URL = BASE + "/flow/"
SELFTEST = "--selftest" in sys.argv
SAMPLE = sorted(["ลูกค้าแจ้งเรื่อง", "Call Center รับเรื่อง", "แก้ได้เองไหม?", "ปิดงาน", "ส่งช่างหน้างาน", "ช่างปิดงาน"])

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def boxes(pg):
    return sorted(t for t, _ in cells(drawio_xml(preview_png(pg)) or ""))


def ready(pg, ms=60000):
    pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready' && !document.querySelector('#live').hasAttribute('data-busy')", timeout=ms)


def editor_frame(pg):
    for f in pg.frames:
        if "embed.diagrams.net" in f.url and f.evaluate("() => !!document.querySelector('.geMenubar')"):
            return f
    return None


def open_room(pg):
    pg.click("#edit")
    pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready'", timeout=60000)
    pg.wait_for_timeout(500)


def wipe_in_room(pg):
    """แก้แบบผู้ใช้: คลิกผืนผัง เลือกทั้งหมด แล้วลบ"""
    box = pg.locator("#room iframe").bounding_box()
    pg.mouse.click(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.6)
    pg.keyboard.press("Control+a"); pg.keyboard.press("Delete")
    pg.wait_for_timeout(1200)


def press_room_button(pg, th_text, discard=False):
    """กดปุ่มของ draw.io ในห้อง ‼️ กด "ออก" หลังแก้แล้ว draw.io ถามก่อนทิ้ง (เห็นจากภาพจริง shots/room-exit-click.png)
    discard=True = ตอบ "ละทิ้งการเปลี่ยนแปลง" เหมือนผู้ใช้ คืนค่าว่าถามจริงไหม"""
    f = editor_frame(pg)
    f.get_by_text(th_text, exact=True).first.click()
    asked = False
    if discard:
        btn = f.get_by_text("ละทิ้งการเปลี่ยนแปลง", exact=True)
        try:
            btn.first.wait_for(state="visible", timeout=5000); asked = True; btn.first.click()
        except Exception:
            asked = False
    pg.wait_for_function("() => document.querySelector('#room').hidden", timeout=20000)
    pg.wait_for_timeout(600)
    return asked


def pdf_export_leaks(pg, ctx):
    """กดส่งออก PDF จากเมนูของ draw.io ในห้องแก้ไขแบบผู้ใช้ แล้วดักทุกคำขอที่ออกนอกเครื่อง
    ‼️ draw.io สร้าง PDF ที่เซิร์ฟเวอร์ของเขา (POST convert.diagrams.net/node/export พร้อมผังทั้งผัง) ห้องของเราปิดด้วย lockdown=1
    คืน (ขั้นที่กดได้จริง, คำขอที่ออกนอกเครื่อง) ฟอนต์จาก Google ไม่นับ (GET ไฟล์ฟอนต์ ไม่มีข้อมูลผัง)"""
    import urllib.parse
    ok_hosts = ("127.0.0.1", "localhost", "embed.diagrams.net", "fonts.googleapis.com", "fonts.gstatic.com", "patcharasitp.github.io")
    leaks, steps = [], []
    def on_req(r):
        host = urllib.parse.urlparse(r.url).hostname or ""
        if host and host not in ok_hosts: leaks.append(f"{r.method} {r.url[:80]} body={len(r.post_data or '')}")
    open_room(pg)
    ctx.on("request", on_req)
    f = editor_frame(pg)
    try:
        f.get_by_text("ไฟล์", exact=True).first.click(); steps.append("ไฟล์"); pg.wait_for_timeout(600)
        f.get_by_text("ส่งออกเป็น", exact=True).first.hover(); steps.append("ส่งออกเป็น"); pg.wait_for_timeout(700)
        f.get_by_text("PDF...", exact=True).first.click(); steps.append("PDF"); pg.wait_for_timeout(1200)
        f.get_by_role("button", name="ส่งออก", exact=True).last.click(); steps.append("ส่งออก"); pg.wait_for_timeout(1500)
        save = f.get_by_role("button", name="บันทึก", exact=True)
        if save.count() and save.last.is_visible():            # ไม่ล็อกจะมีหน้าตั้งชื่อไฟล์ก่อนยิงเซิร์ฟเวอร์
            save.last.click(); steps.append("บันทึก")
        pg.wait_for_timeout(6000)
    except Exception as e:
        steps.append("หยุดที่: " + str(e).split("\n")[0][:120])
    ctx.remove_listener("request", on_req)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    press_room_button(pg, "ออก", discard=True)
    return steps, leaks


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk_floweditor_"))
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL); ready(pg)

            if SELFTEST:
                print("\n━━ selftest ━━")
                before = boxes(pg)
                ck("ตัวตรวจอ่านผังตัวอย่างได้ 6 กล่อง (ประชากรไม่เป็นศูนย์)", before == SAMPLE, str(before))
                open_room(pg); wipe_in_room(pg); press_room_button(pg, "บันทึก และ ออก")
                ck("ตัวตรวจเห็นว่าผังหลังแก้ต่างจากผังเดิม", boxes(pg) != before)
                pg.click("#cvnote button:has-text('วาดใหม่จากข้อความ')")
                pg.wait_for_timeout(2500)
                ck("ตัวตรวจเห็นว่าผังถูกวาดทับกลับเป็นผังจากข้อความ", boxes(pg) == SAMPLE)
                b.close()
                return finish()

            print("\n━━ ก. เปิดห้องแก้ไขจากผังที่วาดอยู่ ━━")
            ck("ผังตัวอย่างขึ้นแล้ว ปุ่มลากแก้ต่อกดได้", boxes(pg) == SAMPLE and pg.is_enabled("#edit"))
            open_room(pg)
            f = editor_frame(pg)
            ck("กดลากแก้ต่อ ห้องแก้ไขเปิดเต็มจอ เมนูเป็นภาษาไทย", f is not None and f.get_by_text("บันทึก และ ออก", exact=True).count() > 0)
            ck("ห้องแก้ไขได้ผังเดียวกับพรีวิว (ข้อความไทยครบในห้อง)",
               f is not None and f.evaluate("() => document.body.innerText.includes('ลูกค้าแจ้งเรื่อง') && document.body.innerText.includes('ช่างปิดงาน')"))
            ck("หน้าเบื้องหลังเลื่อนไม่ได้ระหว่างอยู่ในห้อง", pg.evaluate("() => getComputedStyle(document.body).overflow") == "hidden")

            print("\n━━ ข. ออกโดยไม่บันทึก ━━")
            wipe_in_room(pg)
            asked = press_room_button(pg, "ออก", discard=True)
            ck("กดออกหลังแก้ draw.io ถามก่อนทิ้งงาน", asked)
            ck("กดออก ผังเดิมไม่เปลี่ยน ไม่มีป้ายแก้ด้วยมือ", boxes(pg) == SAMPLE and pg.evaluate("() => document.querySelector('#cvnote').hidden"))
            ck("กดออกแล้ว ไม่มีผังที่แก้ค้างไว้ในเครื่อง", pg.evaluate("() => sessionStorage.getItem('fk-flow-edit')") is None)
            ck("ออกจากห้องแล้วโฟกัสกลับมาที่ปุ่มลากแก้ต่อ", pg.evaluate("() => document.activeElement && document.activeElement.id") == "edit")

            print("\n━━ ค. แก้แล้วบันทึก ━━")
            open_room(pg); wipe_in_room(pg)
            ck("ระหว่างแก้ ผังถูกเก็บไว้กันงานหาย", (pg.evaluate("() => (sessionStorage.getItem('fk-flow-edit') || '').length") or 0) > 100)
            press_room_button(pg, "บันทึก และ ออก")
            ck("บันทึกแล้ว พรีวิวเป็นผังที่แก้ (ลบทุกกล่องแล้ว เหลือ 0)", boxes(pg) == [], str(boxes(pg)))
            ck("มีป้ายบอกว่าผังนี้แก้ด้วยมือ พร้อมปุ่มวาดใหม่จากข้อความ",
               not pg.evaluate("() => document.querySelector('#cvnote').hidden") and pg.locator("#cvnote button", has_text="วาดใหม่จากข้อความ").count() == 1)
            with pg.expect_download() as d:
                pg.click("#dl")
            p = tmp / "edited.png"; d.value.save_as(str(p))
            ck("ดาวน์โหลดได้ผังที่แก้ ตรงกับภาพบนจอทุกไบต์", hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256(preview_png(pg)).digest())

            print("\n━━ ง. ข้อความกับผังแยกทางกัน ━━")
            set_text(pg, "ข้อความใหม่หลังแก้\nอีกขั้นหนึ่ง")
            pg.wait_for_timeout(2500)
            ck("‼️ พิมพ์ต่อหลังแก้ด้วยมือ ผังที่แก้ไม่ถูกวาดทับเอง", boxes(pg) == [], str(boxes(pg)))
            ck("ป้ายบอกว่าข้อความเปลี่ยนแล้ว แต่ผังยังเป็นแบบที่แก้", "ข้อความเปลี่ยนแล้ว" in pg.inner_text("#cvnote"), pg.inner_text("#cvnote"))
            pg.reload(); pg.wait_for_timeout(500)
            try:
                ready(pg, 60000); restored = boxes(pg)
            except Exception:
                restored = None
            ck("‼️ โหลดหน้าใหม่ ได้ผังที่แก้กลับมา ไม่ใช่ผังจากข้อความ", restored == [], str(restored))
            ck("โหลดหน้าใหม่ ข้อความที่พิมพ์ยังอยู่ และป้ายยังบอกสถานะถูก", pg.input_value("#src").startswith("ข้อความใหม่หลังแก้") and "ข้อความเปลี่ยนแล้ว" in pg.inner_text("#cvnote"))
            pg.click("#cvnote button:has-text('วาดใหม่จากข้อความ')")
            got = None
            for _ in range(60):
                pg.wait_for_timeout(500)
                if state(pg) == "ready" and boxes(pg) == sorted(["ข้อความใหม่หลังแก้", "อีกขั้นหนึ่ง"]): got = True; break
            ck("กดวาดใหม่จากข้อความ ได้ผังจากข้อความปัจจุบัน ป้ายหาย ผังที่แก้ถูกล้าง", bool(got) and pg.evaluate("() => document.querySelector('#cvnote').hidden")
               and pg.evaluate("() => sessionStorage.getItem('fk-flow-edit')") is None)

            print("\n━━ จ. เปิดไฟล์ผังเดิม ━━")
            pg.set_input_files("#filein", str(p))
            try:
                pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready'", timeout=60000); opened = True
            except Exception:
                opened = False
            ck("เลือกไฟล์ .drawio.png ที่เคยดาวน์โหลด ห้องแก้ไขเปิดพร้อมผังในไฟล์", opened)
            if opened:
                press_room_button(pg, "บันทึก และ ออก")
                ck("บันทึกจากไฟล์ที่เปิด พรีวิวเป็นผังในไฟล์ (0 กล่อง) พร้อมป้ายแก้ด้วยมือ",
                   boxes(pg) == [] and pg.evaluate("() => document.querySelector('#cvnote').hidden") is False)
            plain = tmp / "plain.png"
            plain.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="))
            pg.set_input_files("#filein", str(plain)); pg.wait_for_timeout(800)
            ck("ภาพ PNG ธรรมดา บอกว่าไม่มีผังฝังอยู่ ไม่เปิดห้องเปล่า", "ไม่มีผัง draw.io" in pg.inner_text("#msg") and pg.evaluate("() => document.querySelector('#room').hidden"),
               pg.inner_text("#msg"))
            drop_ok = pg.evaluate("""async (b64) => {
                const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                const dt = new DataTransfer(); dt.items.add(new File([u], 'ลากมา.drawio.png', { type: 'image/png' }));
                const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
                document.querySelector('#canvas').dispatchEvent(ev); return ev.defaultPrevented; }""", base64.b64encode(p.read_bytes()).decode())
            try:
                pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready' && !document.querySelector('#room').hidden", timeout=60000); dropped = True
            except Exception:
                dropped = False
            ck("ลากไฟล์ .drawio.png มาวางบนหน้า ห้องแก้ไขเปิดเอง", drop_ok and dropped)
            if dropped: press_room_button(pg, "ออก", discard=True)

            print("\n━━ ฉ. จัดวางใหม่ กับไฟล์ SVG ━━")
            if not pg.evaluate("() => document.querySelector('#cvnote').hidden"):
                pg.click("#cvnote button:has-text('วาดใหม่จากข้อความ')")
            set_text(pg, "ขั้นหนึ่ง\nขั้นสอง\nผ่านไหม?\n  ผ่าน: ขั้นสาม\n  ไม่ผ่าน: กลับไป: ขั้นหนึ่ง")
            want = sorted(["ขั้นหนึ่ง", "ขั้นสอง", "ผ่านไหม?", "ขั้นสาม"])
            for _ in range(60):
                pg.wait_for_timeout(500)
                if state(pg) == "ready" and boxes(pg) == want: break
            open_room(pg); press_room_button(pg, "บันทึก และ ออก")
            lay = pg.locator("#cvnote button", has_text="จัดวางใหม่")
            ck("ผังที่แก้ด้วยมือและไม่มีกรอบกลุ่ม มีปุ่มจัดวางใหม่", lay.count() == 1)
            if lay.count():
                src0 = pg.evaluate("() => document.querySelector('#png').currentSrc")
                lay.click()
                try:
                    pg.wait_for_function("(p) => document.querySelector('#png').currentSrc !== p && document.querySelector('#canvas').dataset.state === 'ready'", arg=src0, timeout=30000); ok = True
                except Exception:
                    ok = False
                ck("กดจัดวางใหม่ ได้ผังใหม่ กล่องครบเท่าเดิม ยังเป็นผังที่แก้ด้วยมือ", ok and boxes(pg) == want and not pg.evaluate("() => document.querySelector('#cvnote').hidden"),
                   str(boxes(pg)))
            with pg.expect_download() as d:
                pg.click("#dlsvg")
            svgp = tmp / "edited.svg"; d.value.save_as(str(svgp))
            pg.set_input_files("#filein", str(svgp))
            try:
                pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready' && !document.querySelector('#room').hidden", timeout=60000)
                f = editor_frame(pg); svg_ok = f is not None and f.evaluate("() => document.body.innerText.includes('ขั้นสาม')")
            except Exception:
                svg_ok = False
            ck("เปิดไฟล์ SVG ที่ FlowKit ส่งออก ห้องแก้ไขเปิดพร้อมผังเดิม", svg_ok)
            if svg_ok: press_room_button(pg, "ออก", discard=True)
            pg.click("#cvnote button:has-text('วาดใหม่จากข้อความ')")
            set_text(pg, "[ฝ่ายขาย] รับคำสั่ง\n[คลัง] จัดของ")
            for _ in range(60):
                pg.wait_for_timeout(500)
                if state(pg) == "ready" and boxes(pg) == sorted(["รับคำสั่ง", "จัดของ", "ฝ่ายขาย", "คลัง"]): break
            open_room(pg); press_room_button(pg, "บันทึก และ ออก")
            ck("ผังที่มีกรอบกลุ่มไม่มีปุ่มจัดวางใหม่ (จัดแล้วกล่องหลุดกรอบ)", pg.locator("#cvnote button", has_text="จัดวางใหม่").count() == 0
               and not pg.evaluate("() => document.querySelector('#cvnote').hidden"))
            # ‼️ ผังองค์กรที่แก้ด้วยมือแล้วกดจัดวางใหม่ เส้นต้องยังหักฉาก (ตัวจัดวางเติม noEdgeStyle=1 เส้นเคยกลายเป็นเส้นเฉียง 22/09/2026)
            if not pg.evaluate("() => document.querySelector('#cvnote').hidden"):
                pg.click("#cvnote button:has-text('วาดใหม่จากข้อความ')")
            org_want = sorted(["ผู้อำนวยการ", "ผู้จัดการฝ่ายขาย", "ทีมขายภาคเหนือ", "ทีมขายภาคใต้", "ผู้จัดการฝ่ายบัญชี", "ทีมบัญชีเจ้าหนี้"])
            pg.click("#types [data-kind=org]")
            for _ in range(60):
                pg.wait_for_timeout(500)
                if state(pg) == "ready" and boxes(pg) == org_want: break
            open_room(pg); press_room_button(pg, "บันทึก และ ออก")
            lay = pg.locator("#cvnote button", has_text="จัดวางใหม่"); es = []
            if lay.count():
                src0 = pg.evaluate("() => document.querySelector('#png').currentSrc")
                lay.click()
                try:
                    pg.wait_for_function("(p) => document.querySelector('#png').currentSrc !== p && document.querySelector('#canvas').dataset.state === 'ready'", arg=src0, timeout=30000)
                except Exception:
                    pass
                es = edges(drawio_xml(preview_png(pg)) or "")
            ck("‼️ ผังองค์กรที่แก้ด้วยมือ กดจัดวางใหม่แล้วเส้นยังหักฉาก ใช้จุดหักร่วม (ตัวจัดวางเคยทำให้เป็นเส้นเฉียง)",
               boxes(pg) == org_want and len(es) == 5 and all("edgeStyle=elbowEdgeStyle" in st and "noEdgeStyle" not in st for st, _, _ in es) and one_bus(es),
               str([(st[-60:], p) for st, p, _ in es[:2]]))
            pdf_steps, leaks = pdf_export_leaks(pg, ctx)
            ck("ตัวตรวจไปถึงขั้นกดส่งออก PDF ในห้องแก้ไขจริง (เมนู ไฟล์ → ส่งออกเป็น → PDF → ส่งออก)", "ส่งออก" in pdf_steps, str(pdf_steps))
            ck("‼️ กดส่งออก PDF ในห้องแก้ไข ผังไม่ถูกส่งออกนอกเครื่อง (เดิมส่งไป convert.diagrams.net ทั้งผัง จับได้ 22/09/2026)", not leaks, str(leaks[:3]))
            ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
            b.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจเห็นผังที่แก้และผังที่ถูกวาดทับ" if SELFTEST else "✅ ห้องแก้ไขใช้ได้จริง งานที่แก้ไม่หาย ไม่ถูกวาดทับเอง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
