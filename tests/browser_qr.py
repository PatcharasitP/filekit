# สร้าง QR บนเบราว์เซอร์จริง ทุกข้ออ่านกลับด้วย jsQR (tests/lib/jsQR.cjs) ไม่ใช่แค่ดูว่ามีภาพ
# ‼️ ค่าที่คาดลอกจากผลจริงที่ฟ้าเปิดดูเอง 29/09/2026
import base64, os, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
JSQR = pathlib.Path(__file__).resolve().parent / "lib" / "jsQR.cjs"
TH = "สวัสดีค่ะ ที่นี่ ญี่ปุ่น น้ำ ปั้น"
P, Fa = 0, []

def ck(name, got, want, contains=False):
    global P
    ok = (want in str(got)) if contains else (got == want)
    if ok: P += 1
    else: Fa.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {'…มีคำว่า ' + repr(want) if contains else repr(want)}")
    print(f"  {'✅' if ok else '❌'} {name}")

# ‼️ หน้า FileKit มี CSP ห้ามแทรกสคริปต์ (ถูกต้องแล้ว ห้ามปิดด้วย bypass_csp เพราะเทสจะมองไม่เห็นปัญหา CSP จริง)
#    จึงเปิดหน้าเปล่าแยกไว้ให้ jsQR แล้วส่งภาพจากหน้าเครื่องมือไปถอดที่นั่น
CANVAS_URL = "() => { const c = document.querySelector('.qr-box canvas'); return [c.toDataURL('image/png'), c.width]; }"
DECODE_URL = """async ([src, w]) => { const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = w; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, w); x.drawImage(img, 0, 0, w, w);
  const d = x.getImageData(0, 0, w, w); const r = jsQR(d.data, w, w);
  return { text: r ? r.data : null, natural: img.naturalWidth }; }"""

def decoder(ctx):
    d = ctx.new_page()
    d.goto("about:blank")
    d.add_script_tag(path=str(JSQR))
    return d

def read_canvas(pg, dec):
    src, w = pg.evaluate(CANVAS_URL)
    return dec.evaluate(DECODE_URL, [src, w])["text"]

def summary(pg):
    return pg.locator(".qr-sum").inner_text()

def typ(pg, text):
    pg.locator(".qr-ta").fill(text)
    pg.wait_for_timeout(700)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/qr-code", wait_until="networkidle")
    pg.wait_for_selector(".qr-ta", timeout=15000)
    dec = decoder(ctx)

    print("\n━━ ① ยังไม่พิมพ์ ปุ่มดาวน์โหลดกดไม่ได้ ━━")
    png = pg.locator("button.btn:visible", has_text="ดาวน์โหลด PNG").first
    svg = pg.locator("button.btn:visible", has_text="ดาวน์โหลด SVG").first
    ck("มีปุ่ม PNG และ SVG ให้ตรวจ (ประชากรไม่ว่าง)", [png.count(), svg.count()], [1, 1])
    ck("ปุ่ม PNG ปิดอยู่", png.is_disabled(), True)

    print("\n━━ ② พิมพ์ไทยแล้ว QR บนจออ่านกลับได้ตรง ━━")
    typ(pg, TH)
    ck("อ่าน QR บนจอกลับได้ข้อความเดิม", read_canvas(pg, dec), TH)
    s = summary(pg)
    ck("บรรทัดสรุปบอกจำนวนช่อง", s, "QR 41 x 41 ช่อง", contains=True)
    ck("ปุ่ม PNG เปิดแล้ว", png.is_disabled(), False)

    print("\n━━ ③ ระดับทนรอยเปื้อนสูงขึ้น QR แน่นขึ้น และยังอ่านได้ ━━")
    pg.locator(".seg-item", has_text="30%").click()
    pg.wait_for_timeout(500)
    ck("ระดับ 30% ได้ช่องมากขึ้น", summary(pg), "QR 53 x 53 ช่อง", contains=True)
    ck("ระดับ 30% อ่านกลับได้", read_canvas(pg, dec), TH)
    pg.locator(".seg-item", has_text="15%").click()
    pg.wait_for_timeout(500)

    print("\n━━ ④ ไฟล์ PNG ที่ดาวน์โหลดได้ อ่านกลับได้ ━━")
    with pg.expect_download() as d:
        png.click()
    f = d.value
    data = pathlib.Path(f.path()).read_bytes()
    ck("ชื่อไฟล์", f.suggested_filename, "qr-code.png")
    ck("เป็นไฟล์ PNG จริง", data[:8], b"\x89PNG\r\n\x1a\n")
    r = dec.evaluate(DECODE_URL, ["data:image/png;base64," + base64.b64encode(data).decode(), 600])
    ck("อ่าน PNG กลับได้ข้อความเดิม", r["text"], TH)
    ck("ภาพไม่เกิน 1024 พิกเซลที่เลือก", 900 < r["natural"] <= 1024, True)

    print("\n━━ ⑤ ไฟล์ SVG ที่ดาวน์โหลดได้ อ่านกลับได้ ━━")
    with pg.expect_download() as d:
        svg.click()
    f = d.value
    data = pathlib.Path(f.path()).read_bytes()
    ck("ชื่อไฟล์", f.suggested_filename, "qr-code.svg")
    ck("ขึ้นต้นด้วยแท็ก svg", data[:4], b"<svg")
    r = dec.evaluate(DECODE_URL, ["data:image/svg+xml;base64," + base64.b64encode(data).decode(), 600])
    ck("อ่าน SVG กลับได้ข้อความเดิม", r["text"], TH)

    print("\n━━ ⑥ เตือนเรื่องสีที่กล้องอ่านยาก ━━")
    # ‼️ หลังดาวน์โหลด หน้าเข้าสถานะผลลัพธ์และซ่อนแผงตั้งค่า (วัดจริง 29/09/2026) จึงเปิดเครื่องมือใหม่ก่อนตรวจสี
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/qr-code", wait_until="networkidle")
    pg.wait_for_selector(".qr-ta", timeout=15000)
    typ(pg, TH)
    hexes = pg.locator(".ck-hex")
    ck("มีช่องสีจุดกับสีพื้น (ประชากรไม่ว่าง)", hexes.count(), 2)
    warn = pg.locator(".qr-warn")
    ck("สีดำบนขาวไม่เตือน", warn.is_hidden(), True)
    hexes.nth(0).fill("#BFBFBF")
    pg.wait_for_timeout(400)
    ck("จุดเทาอ่อนบนขาว เตือนความต่างน้อย", warn.inner_text() if warn.is_visible() else "", "ต่างกันแค่", contains=True)
    hexes.nth(0).fill("#FFFFFF"); hexes.nth(1).fill("#000000")
    pg.wait_for_timeout(400)
    ck("จุดขาวบนดำ เตือนว่ากล้องอ่านไม่ออก", warn.inner_text() if warn.is_visible() else "", "จุดสีอ่อนบนพื้นเข้ม", contains=True)
    hexes.nth(0).fill("#000000"); hexes.nth(1).fill("#FFFFFF")
    pg.wait_for_timeout(400)
    ck("กลับเป็นดำบนขาว คำเตือนหาย", warn.is_hidden(), True)

    print("\n━━ ⑦ ข้อความยาวเกิน บอกตรง ๆ และปิดปุ่มดาวน์โหลด ━━")
    typ(pg, "ก" * 1000)
    ck("ขึ้นข้อความยาวเกิน", pg.locator(".status").first.inner_text(), "ยาวเกิน", contains=True)
    ck("ปุ่ม PNG ปิด", png.is_disabled(), True)
    typ(pg, "https://patcharasitp.github.io/filekit/")
    ck("กลับมาพิมพ์สั้น อ่านได้อีกครั้ง", read_canvas(pg, dec), "https://patcharasitp.github.io/filekit/")

    print("\n━━ ⑧ มือถือ 390 ━━")
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    m.add_init_script("try{localStorage.setItem('fk-lang','th')}catch(e){}")
    mp = m.new_page()
    mp.on("pageerror", lambda e: errs.append(str(e)))
    mp.goto(f"{BASE}/#/qr-code", wait_until="networkidle")
    mp.wait_for_selector(".qr-ta", timeout=15000)
    mdec = decoder(m)
    mp.locator(".qr-ta").fill(TH)
    mp.wait_for_timeout(800)
    ck("อ่าน QR บนมือถือกลับได้", read_canvas(mp, mdec), TH)
    box = mp.locator(".qr-box canvas").bounding_box()
    ck("QR อยู่ในความกว้างจอ", box is not None and box["x"] >= 0 and box["x"] + box["width"] <= 390, True)
    ck("ไม่มีสกอลล์แนวนอน", mp.evaluate("document.documentElement.scrollWidth <= screen.width + 1"), True)
    m.close()

    print("\n━━ ⑨ ปุ่มสีสำเร็จรูปมีสีจริง ทุกเครื่องมือที่ใช้ตัวเลือกสี ━━")
    # ‼️ บั๊กเจอ 29/09/2026 ตอนดูภาพเครื่องมือนี้ index.html ลงทะเบียน @property --sw เป็นเปอร์เซ็นต์ (แสงวิ่งหน้าแรก)
    #    ค่าสี --sw ของ colorkit จึงถูกปัดเป็น -32% ปุ่มสีทุกปุ่มโปร่งใส เว็บจริง pa-html-table 24 ปุ่มโปร่งใสหมด
    SW = """() => [...document.querySelectorAll('.ck-sw')].map(e => {
      const want = (e.getAttribute('aria-label') || '').toLowerCase(); const c = getComputedStyle(e).backgroundColor.match(/\\d+/g) || [];
      const got = '#' + c.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
      return [want, got]; })"""
    for tid in ["qr-code", "pa-html-table"]:
        sp = ctx.new_page()
        sp.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        sp.wait_for_selector(".ck-sw", state="attached", timeout=15000)
        pairs = sp.evaluate(SW)
        ck(f"{tid} มีปุ่มสีให้ตรวจ (ประชากรไม่ว่าง)", len(pairs) >= 4, True)
        ck(f"{tid} ปุ่มสีที่สีไม่ตรงกับชื่อ", [p for p in pairs if p[0] != p[1]][:3], [])
        sp.close()

    ck("ไม่มี error บนหน้า", errs, [])
    b.close()

print("\n" + "━" * 52)
print(f"ผ่าน {P} ตก {len(Fa)}")
if Fa:
    print("\nรายการที่ตก:"); [print(f"  {i + 1}. {f}") for i, f in enumerate(Fa)]
    raise SystemExit(1)
