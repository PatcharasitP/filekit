"""PNG ที่ FileKit ส่งออกต้องผ่าน OxiPNG แล้ว เล็กกว่า PNG ของ canvas และพิกเซลเท่าเดิมทุกค่า (24/09/2026)

ที่มา: พี่ปอนด์ถามเรื่อง Squoosh วัดจริงแล้ว OxiPNG ลด PNG ของ canvas 18 ถึง 56% โดยไม่เสียคุณภาพ
   พี่ปอนด์เลือกให้เอาเข้าเฉพาะตัวนี้ (ไม่เอา AVIF, MozJPEG) หลักฐาน .claude/evidence/2026-09-24-squoosh-vs-filekit
เทสนี้ยืนยันปลายทางจริง
   ① optimisePng คืน PNG ที่เล็กกว่า และถอดแล้วได้พิกเซลเท่าเดิมทุกค่า
   ② ระหว่างบีบ หน้าเว็บยังขยับได้ (งานอยู่ใน worker ไม่ได้ยึดเธรดหลัก)
   ③ โหลดตัวบีบไม่ได้ (ออฟไลน์ครั้งแรก) ต้องคืนไฟล์เดิม ไม่ error
   ④ ไฟล์ที่ดาวน์โหลดจากเครื่องมือแปลงรูป ย่อรูป และลบพื้นหลัง เล็กกว่า PNG ที่ canvas ทำจากพิกเซลเดียวกัน และพิกเซลเท่ากัน
   ⑤ ไม่มี error หลุด
‼️ พิสูจน์แล้วว่าเทสแดงเป็น: ให้ optimisePng คืนไฟล์เดิมเสมอ ข้อ ① กับ ④ ตกทั้งหมด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_pngopt.py
"""
import os, sys, tempfile, pathlib, base64
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

BASE = os.environ.get("FK_BASE", "http://localhost:8899").rstrip("/")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

# รูปทดสอบแบบภาพหน้าจอ: สีเรียบ เส้น ตัวหนังสือ ซึ่งเป็นงานที่ OxiPNG ลดได้มากที่สุด
TMP = pathlib.Path(tempfile.mkdtemp())
SRC = TMP / "screen.png"
im = Image.new("RGB", (900, 600), "#f7f6f2")
d = ImageDraw.Draw(im)
for i in range(12):
    d.rectangle((30 + i * 70, 40, 90 + i * 70, 560), outline="#c9c4b8", fill=("#ffffff" if i % 2 else "#efe9dd"))
    for j in range(20):
        d.text((36 + i * 70, 50 + j * 25), f"r{j}c{i}", fill="#2a2926")
d.ellipse((600, 300, 860, 560), fill="#b8502e")
im.save(SRC, optimize=False, compress_level=0)   # ‼️ ต้นฉบับต้องใหญ่กว่า PNG ของ canvas ไม่งั้นเครื่องมือย่อรูปคืนไฟล์เดิม
                                                  #    แล้วข้อ ④ ผ่านทั้งที่ไม่ได้บีบ (เจอตอนพิสูจน์แดง 24/09/2026)

# ในหน้าเว็บ: ถอด PNG เป็นพิกเซล แล้วเข้ารหัสใหม่ด้วย canvas เพื่อใช้เป็นเส้นฐาน
PIXELS_JS = """async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261; for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 16777619); }
  const canvasPng = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { w: c.width, h: c.height, hash: h >>> 0, canvasBytes: canvasPng.size };
}"""

def pixel_check(pg, path, label):
    data = pathlib.Path(path).read_bytes()
    r = pg.evaluate(PIXELS_JS, base64.b64encode(data).decode())
    ck(f"{label}: เล็กกว่า PNG ที่ canvas ทำจากพิกเซลเดียวกัน ({len(data)} เทียบ {r['canvasBytes']} ไบต์)", len(data) < r["canvasBytes"] * 0.95, (len(data), r["canvasBytes"]))
    return r

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(accept_downloads=True, service_workers="block")
    reqs = []
    ctx.on("request", lambda q: reqs.append(q.url))   # ‼️ ไฟล์ wasm โหลดจากใน worker ไม่อยู่ใน performance ของหน้า ต้องดักที่ context
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE + "/", wait_until="networkidle")

    print("\n① optimisePng บีบได้จริง พิกเซลเท่าเดิม")
    r = pg.evaluate("""async () => {
      const { optimisePng } = await import('./src/pngopt.js');
      const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
      const x = c.getContext('2d'); x.fillStyle = '#f7f6f2'; x.fillRect(0, 0, 1200, 800);
      for (let i = 0; i < 40; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#efe9dd'; x.fillRect(20 + i * 29, 30, 24, 740);
        x.fillStyle = '#2a2926'; x.font = '12px sans-serif'; for (let j = 0; j < 30; j++) x.fillText('a' + j, 22 + i * 29, 45 + j * 24); }
      const src = await new Promise((r) => c.toBlob(r, 'image/png'));
      const t0 = performance.now(); const out = await optimisePng(src); const ms = performance.now() - t0;
      const px = async (b) => { const bm = await createImageBitmap(b); const k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
        const g = k.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, k.width, k.height).data; };
      const a = await px(src), b = await px(out); let same = a.length === b.length; for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
      const res = performance.getEntriesByType('resource').map((e) => e.name);
      return { src: src.size, out: out.size, type: out.type, same, ms: Math.round(ms),
               worker: res.some((n) => n.endsWith('/src/pngopt-worker.js')) };
    }""")
    ck(f"ไฟล์เล็กลง ({r['src']} เป็น {r['out']} ไบต์, {r['ms']} ms)", r["out"] < r["src"] * 0.9, r)
    ck("ยังเป็น PNG", r["type"] == "image/png", r["type"])
    ck("ถอดแล้วพิกเซลเท่าเดิมทุกค่า", r["same"])
    wasm = [u for u in reqs if u.endswith("/vendor/oxipng/squoosh_oxipng_bg.wasm")]
    ck("โหลดตัวบีบจากเว็บเราเอง (worker และ wasm ใน vendor)", r["worker"] and wasm and all(u.startswith(BASE) for u in wasm), (r["worker"], wasm))

    print("\n② ระหว่างบีบ หน้าเว็บยังขยับได้")
    r = pg.evaluate("""async () => {
      const { optimisePng } = await import('./src/pngopt.js');
      const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
      const x = c.getContext('2d');
      for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${i * 37 % 360} 40% ${50 + i % 30}%)`; x.fillRect((i * 53) % 2400, (i * 97) % 1600, 60, 40); }
      const src = await new Promise((r) => c.toBlob(r, 'image/png'));
      let ticks = 0; const iv = setInterval(() => ticks++, 20);
      const t0 = performance.now(); await optimisePng(src); const ms = performance.now() - t0; clearInterval(iv);
      return { ticks, ms: Math.round(ms) };
    }""")
    ck(f"นับเวลาได้ต่อเนื่องระหว่างบีบ ({r['ticks']} ครั้งใน {r['ms']} ms)", r["ms"] >= 150 and r["ticks"] >= r["ms"] / 20 * 0.4, r)

    print("\n③ โหลดตัวบีบไม่ได้ ต้องคืนไฟล์เดิม")
    ctx2 = br.new_context(service_workers="block")
    ctx2.route("**/vendor/oxipng/**", lambda route: route.abort())
    pg2 = ctx2.new_page(); errs2 = []
    pg2.on("pageerror", lambda e: errs2.append(str(e)))
    pg2.goto(BASE + "/", wait_until="networkidle")
    r = pg2.evaluate("""async () => {
      const { optimisePng } = await import('./src/pngopt.js');
      const c = document.createElement('canvas'); c.width = 300; c.height = 200; c.getContext('2d').fillRect(10, 10, 100, 100);
      const src = await new Promise((r) => c.toBlob(r, 'image/png'));
      const out = await optimisePng(src);
      return { same: out === src, size: out.size, src: src.size };
    }""")
    ck("ได้ไฟล์เดิมกลับมา ไม่ค้าง ไม่ throw", r["same"], r)
    ck("ไม่มี error หลุดในหน้า", not errs2, errs2)
    ctx2.close()

    print("\n④ ไฟล์จริงจากเครื่องมือ")
    # แปลงรูป เป็น PNG
    pg.goto(BASE + "/#/image-convert", wait_until="networkidle"); pg.wait_for_timeout(600)
    pg.locator("input[type=file]").first.set_input_files(str(SRC)); pg.wait_for_timeout(1200)
    pg.locator("select").filter(has=pg.locator('option[value="ico"]')).first.select_option("png")
    pg.locator("button:visible", has_text="แปลงไฟล์").first.click(); pg.wait_for_timeout(4000)
    out = TMP / "convert.png"
    with pg.expect_download() as dl:
        pg.locator(".s2-side-res button:visible, .result button:visible", has_text="ดาวน์โหลด").first.click()
    dl.value.save_as(out)
    a = pixel_check(pg, out, "แปลงรูป")
    src_px = pg.evaluate(PIXELS_JS, base64.b64encode(SRC.read_bytes()).decode())
    ck("แปลงรูป: พิกเซลเท่ากับรูปต้นฉบับทุกค่า", a["hash"] == src_px["hash"], (a["hash"], src_px["hash"]))

    # ย่อรูป แบบคงชนิดเดิมและไม่ย่อขนาด
    pg.goto(BASE + "/#/image-resize", wait_until="networkidle"); pg.wait_for_timeout(600)
    pg.locator("input[type=file]").first.set_input_files(str(SRC)); pg.wait_for_timeout(1200)
    pg.locator("select").filter(has=pg.locator('option[value="keep"]')).first.select_option("keep")
    pg.locator("select").filter(has=pg.locator('option[value="none"]')).first.select_option("none")
    pg.wait_for_timeout(500)
    pg.locator("button:visible", has_text="ย่อและบีบอัด").first.click(); pg.wait_for_timeout(4000)
    out = TMP / "resize.png"
    with pg.expect_download() as dl:
        pg.locator("button:visible", has_text="ดาวน์โหลดรูป").first.click()
    dl.value.save_as(out)
    r = pixel_check(pg, out, "ย่อรูป คงชนิดเดิม")
    ck("ย่อรูป: ได้ PNG และพิกเซลเท่ากับต้นฉบับทุกค่า", out.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n" and r["hash"] == src_px["hash"], (r["hash"], src_px["hash"]))

    # ลบพื้นหลัง ส่งออก PNG โปร่งใส
    pg.goto(BASE + "/#/image-bg-remove", wait_until="networkidle"); pg.wait_for_timeout(600)
    pg.locator("input[type=file]").first.set_input_files(str(SRC)); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="ลบพื้นหลัง").first.click(); pg.wait_for_timeout(4000)
    out = TMP / "bg.png"
    with pg.expect_download() as dl:
        pg.get_by_role("button", name="ดาวน์โหลด").first.click()
    dl.value.save_as(out)
    pixel_check(pg, out, "ลบพื้นหลัง")

    print("\n⑤ ไม่มี error")
    ck("ไม่มี error หลุดออกมาเลย", not errs, errs[:3])
    br.close()

print(f"\nตก {len(fails)} ข้อ")
if fails:
    sys.exit(1)
print("✅ ผ่านหมด")
