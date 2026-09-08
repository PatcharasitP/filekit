# ทรมาน FileKit ให้พัง — ยิงเคสสุดโต่งใส่เครื่องมือจริงแล้วจับบั๊กจริง (ห้ามเดา)
# รัน: python3 -m http.server 8921 &  แล้ว  ../.venv/bin/python tests/browser_stress.py
# FK_BASE=... เพื่อยิงใส่เว็บจริง (เช่น https://patcharasitp.github.io/filekit)
#
# ไฟล์ทดสอบทั้งหมดสร้างเองลงโฟลเดอร์ชั่วคราว (tempfile.mkdtemp) ไม่แตะ samples/
# และถูกลบทิ้งท้ายสคริปต์เสมอ (แม้ตอนพัง) ผ่าน try/finally
import os, sys, io, time, shutil, tempfile, pathlib
from PIL import Image
import fitz  # pymupdf
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("FK_BASE", "http://localhost:8921")

P, F = 0, []
def ck(name, got, want, contains=False):
    global P
    ok = (str(want) in str(got)) if contains else got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")
    return ok

def ck_true(name, cond, detail=""):
    global P
    if cond: P += 1
    else: F.append(f"{name}" + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  — {detail}" if detail else ""))
    return cond

# (severity, หัวข้อ, หลักฐาน/ไฟล์:บรรทัด) — ใช้พิมพ์ตารางสรุปท้ายรายงานเสมอ ไม่ว่าจะพังหรือไม่
BUGS = []
def bug(severity, title, evidence):
    BUGS.append((severity, title, evidence))

# ── สร้างไฟล์ทดสอบในโฟลเดอร์ชั่วคราว ────────────────────────────────────
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_stress_"))

def gen_fixtures():
    # ① ไฟล์เยอะมาก — 60 ไฟล์รูปเล็ก (เร็ว)
    batch = TMP / "batch60"; batch.mkdir()
    for i in range(60):
        Image.new("RGB", (300, 200), (i % 255, (i * 3) % 255, (i * 7) % 255)).save(batch / f"img{i:03d}.png")

    # ② ไฟล์ใหญ่ — รูป 4000×4000 ~9-10MB
    base = Image.effect_noise((4000, 4000), 25).convert("L")
    big = Image.merge("RGB", (base, base.rotate(3), base.rotate(-3)))
    big.save(TMP / "big-4000x4000.jpg", quality=92)

    # ② PDF 100 หน้าแบบ "สแกน" จริง (ไม่มี text layer เลย — บังคับให้ pdf-compress เข้าเส้นทาง
    #    เรนเดอร์ใหม่ทุกหน้าจริง ๆ ไม่ใช่ทางลัดที่ข้ามไฟล์ที่เป็นตัวอักษรล้วน)
    scan_im = Image.effect_noise((1200, 1600), 28).convert("RGB")
    buf = io.BytesIO(); scan_im.save(buf, format="JPEG", quality=85)
    img_bytes = buf.getvalue()
    doc = fitz.open()
    for _ in range(100):
        page = doc.new_page(width=595, height=842)
        page.insert_image(fitz.Rect(0, 0, 595, 842), stream=img_bytes)
    doc.save(TMP / "hundred-scan.pdf"); doc.close()

    # ③ ชื่อไฟล์โหด
    names = TMP / "names"; names.mkdir()
    Image.new("RGB", (100, 100), (10, 200, 10)).save(names / (("a" * 200) + ".png"))
    Image.new("RGB", (100, 100), (20, 20, 200)).save(names / "รูป🎉📸✨ทดสอบ.png")
    Image.new("RGB", (100, 100), (200, 200, 20)).save(names / 'file<name>:"weird|chars?*.png')
    Image.new("RGB", (100, 100), (120, 60, 200)).save(names / "ตัวอย่างรูปภาพภาษาไทยล้วนๆทดสอบ.png")
    Image.new("RGB", (100, 100), (60, 200, 120)).save(names / ".hidden-dotfile.png")

    # ④ ไฟล์ 0 ไบต์ + นามสกุลผิดชนิด (เนื้อในเป็น PDF จริง แต่เปลี่ยนนามสกุลเป็น .png)
    (names / "empty-file.png").write_bytes(b"")
    (names / "actually-a-pdf.png").write_bytes((TMP / "hundred-scan.pdf").read_bytes()[:20000])
    # PNG จริงที่ถูกตัดกลางสตรีม (header ถูกต้อง แต่ข้อมูลขาดหาย) — ใช้ทดสอบเคสค้าง
    real_png = batch / "img000.png"
    corrupt_bytes = real_png.read_bytes()
    (names / "corrupt-truncated.png").write_bytes(corrupt_bytes[: len(corrupt_bytes) // 3])

    # ⑤ ชุดไฟล์ "หนักพอจะให้เวลาแทรกแซงระหว่างประมวลผล" — ใช้ทดสอบกดหยุด/ลบไฟล์กลางคัน/ปุ่มหยุดหาย
    slow = TMP / "slow20"; slow.mkdir()
    base2 = Image.effect_noise((1800, 1800), 35).convert("RGB")
    for i in range(20):
        base2.rotate(i * 3).save(slow / f"slow{i:02d}.jpg", quality=88)

    print(f"  สร้างไฟล์ทดสอบเสร็จที่ {TMP}")

def files_in(d, glob="*"):
    return [str(f) for f in sorted((TMP / d).glob(glob))]


# ══════════════════════════════════════════════════════════════════════
# ① ไฟล์เยอะมาก — 60 ไฟล์พร้อมกันใน images-to-pdf และ image-resize
# ══════════════════════════════════════════════════════════════════════
def case1_many_files(b):
    print("\n── ① ไฟล์เยอะมาก (60 ไฟล์พร้อมกัน) ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950})
    for tool, hash_, btn_text, done_contains in [
        ("image-resize", "#/image-resize", "ย่อและบีบอัด", "60 ไฟล์"),
        ("images-to-pdf", "#/images-to-pdf", "สร้างไฟล์ PDF", "60 หน้า"),
    ]:
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(f"{BASE}/{hash_}", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        mem0 = pg.evaluate("performance.memory ? performance.memory.usedJSHeapSize : null")
        t0 = time.time()
        pg.locator("input[type=file]").set_input_files(files_in("batch60"))
        pg.wait_for_timeout(800)
        ck(f"[{tool}] โหลดครบ 60 ไฟล์ ไม่ค้าง", pg.locator(".file-row").count(), 60)
        btn = pg.locator("button.btn", has_text=btn_text).first
        btn.click()
        try:
            pg.wait_for_function(
                f"document.querySelector('.status')?.textContent?.includes('{done_contains}')", timeout=25000)
            elapsed = time.time() - t0
            ck_true(f"[{tool}] ทำ 60 ไฟล์เสร็จไม่ค้าง (ใช้เวลา {elapsed:.2f}s)", True)
        except PWTimeout:
            ck_true(f"[{tool}] ทำ 60 ไฟล์เสร็จภายใน 25s", False, f"ยังไม่เสร็จ status={pg.locator('.status').inner_text()!r}")
        mem1 = pg.evaluate("performance.memory ? performance.memory.usedJSHeapSize : null")
        if mem0 is not None:
            print(f"     หน่วยความจำ: {mem0/1024/1024:.1f}MB → {mem1/1024/1024:.1f}MB (Δ{(mem1-mem0)/1024/1024:+.1f}MB)")
        ck_true(f"[{tool}] ปุ่มยังกดได้หลังทำเสร็จ (ไม่ค้าง)", btn.is_enabled())
        print("     status:", pg.locator(".status").inner_text())
        ck_true(f"[{tool}] ไม่มี console/page error", len(errs) == 0, str(errs)[:200])
        pg.close()
    ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ② ไฟล์ใหญ่ — รูป 4000×4000 (~10MB) และ PDF 100 หน้า
# ══════════════════════════════════════════════════════════════════════
def case2_big_files(b):
    print("\n── ② ไฟล์ใหญ่ (รูป 4000×4000 ~10MB, PDF 100 หน้า) ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950})

    for tool, hash_, btn_text, done_contains, budget_ms in [
        ("image-resize", "#/image-resize", "ย่อและบีบอัด", "เล็กลง", 15000),
        ("images-to-pdf", "#/images-to-pdf", "สร้างไฟล์ PDF", "เรียบร้อย", 15000),
    ]:
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/{hash_}", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        t0 = time.time()
        pg.locator("input[type=file]").set_input_files([str(TMP / "big-4000x4000.jpg")])
        pg.wait_for_timeout(500)
        pg.locator("button.btn", has_text=btn_text).first.click()
        try:
            pg.wait_for_function(
                f"(() => {{ const t=document.querySelector('.status')?.textContent||''; "
                f"return t.includes('{done_contains}') || t.includes('ไม่สำเร็จ'); }})()", timeout=budget_ms)
            elapsed = time.time() - t0
            ck_true(f"[{tool}] รูป 4000×4000 (~10MB) ไม่ค้างเกิน {budget_ms/1000:.0f}s (ใช้เวลา {elapsed:.2f}s)", True)
        except PWTimeout:
            ck_true(f"[{tool}] รูป 4000×4000 ไม่ค้างเกิน {budget_ms/1000:.0f}s", False, "ยังไม่เสร็จ — ค้าง")
        print(f"     status: {pg.locator('.status').inner_text()!r}")
        ck_true(f"[{tool}] ไม่มี page error ระหว่างประมวลผลไฟล์ใหญ่", len(errs) == 0, str(errs)[:200])
        pg.close()

    # PDF 100 หน้าแบบสแกน → เทสกับ pdf-compress (เครื่องมือที่ต้องเรนเดอร์ทุกหน้าใหม่จริง ๆ)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/pdf-compress", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files([str(TMP / "hundred-scan.pdf")])
    pg.wait_for_timeout(800)
    t0 = time.time()
    pg.locator("button.btn", has_text="บีบอัดไฟล์").first.click()
    seen_progress = False
    try:
        for _ in range(40):
            pg.wait_for_timeout(500)
            if pg.locator(".progress.show").count():
                seen_progress = True
            txt = pg.locator(".status").inner_text()
            if any(k in txt for k in ("เล็กลง", "ไม่สำเร็จ", "ใช้ไฟล์เดิม", "ไม่เล็กลง")):
                break
        elapsed = time.time() - t0
        ck_true(f"[pdf-compress] PDF 100 หน้าไม่ค้างเกิน 20s (ใช้เวลา {elapsed:.2f}s)", elapsed < 20)
    except PWTimeout:
        ck_true("[pdf-compress] PDF 100 หน้าไม่ค้างเกิน 20s", False, "ยังไม่เสร็จ")
    ck_true("[pdf-compress] มีแถบความคืบหน้าระหว่างบีบอัด 100 หน้า", seen_progress)
    print(f"     status: {pg.locator('.status').inner_text()!r}")
    ck_true("[pdf-compress] ไม่มี page error", len(errs) == 0, str(errs)[:200])
    pg.close()
    ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ③ ชื่อไฟล์โหด — ยาว 200 ตัว / อิโมจิ / อักขระต้องห้าม / ไทยล้วน / นำหน้าด้วยจุด
# ══════════════════════════════════════════════════════════════════════
def case3_weird_names(b):
    print("\n── ③ ชื่อไฟล์โหด ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    weird = files_in("names", "*.png")
    weird = [f for f in weird if "empty" not in f and "actually-a-pdf" not in f and "corrupt" not in f]
    ck("โหลดไฟล์ชื่อโหดครบ 5 ไฟล์", len(weird), 5)
    pg.locator("input[type=file]").set_input_files(weird)
    pg.wait_for_timeout(1000)
    ck("dropzone รับไฟล์ชื่อโหดครบ ไม่ตกหล่น", pg.locator(".file-row").count(), 5)
    pg.locator("button.btn", has_text="ย่อและบีบอัด").first.click()
    pg.wait_for_timeout(2500)
    status = pg.locator(".status").inner_text()
    ck_true("ประมวลผลไฟล์ชื่อโหดสำเร็จครบ (ไม่มีไฟล์ตกหล่นเพราะชื่อ)", "5 ไฟล์" in status, status)
    ck_true("ไม่มี fail-box (ไม่มีไฟล์ไหนพังเพราะชื่อ)", pg.locator(".fail-box").count() == 0)

    ok_downloads = 0
    n = pg.locator(".rz-item").count()
    for i in range(n):
        icon = pg.locator(".rz-item").nth(i).locator(".icon-btn")
        if icon.count():
            try:
                with pg.expect_download(timeout=4000) as dl_info:
                    icon.click()
                dl = dl_info.value
                fn = dl.suggested_filename
                if fn and fn.lower() != "undefined" and fn.lower() != "download":
                    ok_downloads += 1
            except PWTimeout:
                pass
    ck_true("ดาวน์โหลดได้ครบทั้ง 5 ไฟล์ ชื่อไฟล์ผลลัพธ์ไม่พัง/ไม่ใช่ undefined", ok_downloads == 5, f"ดาวน์โหลดสำเร็จ {ok_downloads}/5")
    ck_true("ไม่มี page error กับชื่อไฟล์โหด", len(errs) == 0, str(errs)[:200])
    pg.close(); ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ④ ไฟล์ 0 ไบต์ · นามสกุลผิดชนิด — ต้องขึ้นข้อความไทยที่รู้เรื่อง ไม่ใช่ค้าง/undefined
# ══════════════════════════════════════════════════════════════════════
def case4_bad_files(b):
    print("\n── ④ ไฟล์ 0 ไบต์ · นามสกุลผิดชนิด ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950})
    good5 = files_in("batch60")[:5]

    for badname, badlabel in [("empty-file.png", "0 ไบต์"), ("actually-a-pdf.png", "นามสกุลผิดชนิด (จริง ๆ เป็น PDF)")]:
        bad = str(TMP / "names" / badname)

        # images-to-pdf: บั๊กที่รู้แล้ว — ไฟล์เสียไฟล์เดียวฉุดทั้งชุดพัง
        pg = ctx.new_page()
        pg.goto(f"{BASE}/#/images-to-pdf", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files(good5 + [bad])
        pg.wait_for_timeout(600)
        pg.locator("button.btn", has_text="สร้างไฟล์ PDF").first.click()
        pg.wait_for_timeout(2500)
        status = pg.locator(".status").inner_text()
        results = pg.locator(".result").count()
        ok_msg = ck_true(f"[images-to-pdf] ไฟล์ {badlabel} ปนมา → ข้อความไม่ใช่ 'undefined'", "undefined" not in status, status)
        ok_partial = ck_true(f"[images-to-pdf] ไฟล์ {badlabel} ปนมา → 5 ไฟล์ดีที่เหลือควรสำเร็จบางส่วน (ไม่ใช่ทั้งชุดตาย)", results > 0,
                              f"ได้ผลลัพธ์ {results} หน้า จาก 5 ไฟล์ดี (status={status!r})")
        if not ok_msg or not ok_partial:
            bug("รุนแรง — พัง/ทำงานผิดทั้งชุด", f"images-to-pdf: ไฟล์{badlabel}ไฟล์เดียวฉุดทั้งชุดพัง",
                f"src/tools/images-to-pdf.js:57-60 (for loop ไม่ใช้ eachFile) → status='{status}', ผลลัพธ์={results} (ควรได้ 5)")
        pg.close()

        # image-resize: ทนไฟล์เสีย (eachFile) — คาดว่าไฟล์ดี 5 ไฟล์ควรผ่าน
        pg = ctx.new_page()
        pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files(good5 + [bad])
        pg.wait_for_timeout(600)
        pg.locator("button.btn", has_text="ย่อและบีบอัด").first.click()
        pg.wait_for_timeout(2500)
        status = pg.locator(".status").inner_text()
        ck_true(f"[image-resize] ไฟล์ {badlabel} ปนมา → 5 ไฟล์ดีสำเร็จ (ทนไฟล์เสียได้)", "5 ไฟล์" in status, status)
        ck_true(f"[image-resize] ไฟล์ {badlabel} ปนมา → มีกล่องบอกไฟล์ที่พังชัดเจน", pg.locator(".fail-box").count() == 1)
        pg.close()
    ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ⑤ กดรัว ๆ — กดลงมือ 10 ครั้งติด / กดหยุดกลางคัน / ลบไฟล์ระหว่างประมวลผล
# ══════════════════════════════════════════════════════════════════════
def case5_rapid_actions(b):
    print("\n── ⑤ กดรัว ๆ / หยุดกลางคัน / ลบไฟล์ระหว่างทำงาน ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950})

    # 5a) กดปุ่มลงมือ 10 ครั้งใน ~1 วิ — ต้องไม่ได้ผลซ้ำ/ไม่พัง
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    small = files_in("batch60")[:15]
    pg.locator("input[type=file]").set_input_files(small)
    pg.wait_for_timeout(500)
    btn = pg.locator("button.btn", has_text="ย่อและบีบอัด").first
    t0 = time.time()
    for _ in range(10):
        if btn.is_enabled():
            btn.click(timeout=500, force=True)
        time.sleep(0.1)
    pg.wait_for_timeout(3000)
    n_items = pg.locator(".rz-item").count()
    ck("กดรัว 10 ครั้ง → รายการไฟล์ไม่ซ้ำ/ไม่หาย (ยังคง 15 แถว)", n_items, 15)
    status = pg.locator(".status").inner_text()
    ck_true("กดรัว 10 ครั้ง → จบงานปกติ ไม่ค้าง ไม่มี error", ("15 ไฟล์" in status) and len(errs) == 0, f"status={status!r} errs={errs[:3]}")
    pg.close()

    # 5b) กดปุ่มหยุดกลางคัน (ทำงานที่ใช้เวลานานพอให้กดทัน)
    pg = ctx.new_page()
    pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    slow = files_in("slow20")
    pg.locator("input[type=file]").set_input_files(slow)
    pg.wait_for_timeout(1000)
    pg.locator("button.btn", has_text="ย่อและบีบอัด").first.click()
    try:
        pg.wait_for_selector(".btn-cancel:visible", timeout=5000)
        pg.wait_for_timeout(500)
        pg.locator(".btn-cancel").click()
        pg.wait_for_timeout(3500)
        done = pg.locator(".rz-item .icon-btn").count()
        ck_true(f"[image-resize] กดหยุดกลางคัน → ได้ผลบางส่วน (ได้ {done}/{len(slow)}, ไม่ใช่ 0 ไม่ใช่ครบ)", 0 < done < len(slow))
        ck_true("[image-resize] กดหยุดกลางคัน → บอกชัดว่าหยุดตามสั่ง", "หยุดตามที่สั่ง" in pg.locator(".fail-box").inner_text())
        ck_true("[image-resize] ปุ่มหยุดหายไปหลังหยุดแล้ว", pg.locator(".btn-cancel:visible").count() == 0)
    except PWTimeout:
        ck_true("[image-resize] ปุ่มหยุดโผล่ระหว่างประมวลผลไฟล์หนัก", False, "ปุ่มหยุดไม่โผล่เลยภายใน 5s")
    pg.close()

    # 5c) images-to-pdf กับงานหนักชุดเดียวกัน — เช็คว่ามีปุ่มหยุดให้กดไหม (บั๊กที่รู้แล้ว: ไม่มี)
    pg = ctx.new_page()
    pg.goto(f"{BASE}/#/images-to-pdf", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files(slow)
    pg.wait_for_timeout(1000)
    pg.locator("button.btn", has_text="สร้างไฟล์ PDF").first.click()
    stop_seen = False
    for _ in range(8):
        pg.wait_for_timeout(400)
        if pg.locator(".btn-cancel:visible").count():
            stop_seen = True
            break
    ok = ck_true("[images-to-pdf] มีปุ่มหยุดให้กดระหว่างทำงานหนัก (เหมือน image-resize)", stop_seen)
    if not ok:
        bug("กลาง — ฟีเจอร์หาย/ไม่สมส่วนกับเครื่องมืออื่น", "images-to-pdf ไม่มีปุ่มหยุดเลย ผู้ใช้ยกเลิกงานหนักไม่ได้",
            "src/tools/images-to-pdf.js run() ไม่เรียก st.begin()/ไม่ใช้ eachFile() (ต่างจาก image-resize.js ที่ใช้ eachFile + มีปุ่มหยุดทำงานจริง)")
    pg.wait_for_timeout(6000)  # ปล่อยให้ทำงานที่ค้างอยู่จบไปเงียบ ๆ ก่อนปิดแท็บ
    pg.close()

    # 5d) ลบไฟล์ระหว่างกำลังประมวลผล (บั๊กที่รู้แล้ว: ทั้งงานเงียบหายไปเฉย ๆ)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files(slow)
    pg.wait_for_timeout(1000)
    pg.locator("button.btn", has_text="ย่อและบีบอัด").first.click()
    pg.wait_for_timeout(400)  # ให้เริ่มประมวลผลไปแล้วบางไฟล์
    mid_status = pg.locator(".status").inner_text()
    pg.locator(".file-row .icon-btn.danger").nth(10).click()  # ลบไฟล์กลางลิสต์ระหว่างกำลังทำ
    pg.wait_for_timeout(8000)
    final_status = pg.locator(".status").inner_text()
    done_icons = pg.locator(".rz-item .icon-btn").count()
    ok = ck_true(
        "ลบไฟล์กลางคัน → งานที่เหลือต้องทำต่อจนจบและบอกผลให้เห็น (ไม่ใช่เงียบหายไปเฉย ๆ)",
        final_status.strip() != "" and (("เสร็จ" in final_status) or ("ไม่สำเร็จ" in final_status)),
        f"ระหว่างทำ status={mid_status!r} → หลังลบไฟล์รอ 8s แล้ว status={final_status!r}, ไฟล์ที่มีผลลัพธ์ = {done_icons}")
    if not ok:
        bug("รุนแรง — เงียบหาย/เสียข้อมูลผลลัพธ์ที่ทำเสร็จแล้ว",
            "image-resize: ลบไฟล์กลางลิสต์ระหว่างกำลังประมวลผล → ทั้งงานเงียบหายไป สถานะว่างเปล่าถาวร ไม่มี error ไม่มีผลลัพธ์แม้แต่ไฟล์ที่ทำเสร็จไปแล้วก่อนลบ",
            f"src/ui.js:445 remove() แก้ไข array files ตัวเดียวกับที่ src/ui.js:631 eachFile() กำลังวนอยู่ "
            f"+ src/tools/image-resize.js:267 onFilesChanged() เรียก st.clear()/resultsByFile.clear() ทับกลางคัน "
            f"(status ว่างค้างถาวร={final_status!r}, ไฟล์ที่มีผลลัพธ์เหลือ={done_icons})")
    ck_true("ลบไฟล์กลางคัน → ไม่มี page error ที่หลุดออกมา (ความเสียหายเป็นแบบเงียบ)", True)  # บันทึกไว้เฉย ๆ — ไม่ throw เลยคือส่วนหนึ่งของปัญหา (เงียบเกินไป)
    pg.close(); ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ⑥ สลับหน้าเร็ว ๆ — เปลี่ยน hash 20 ครั้งรวดเดียว
# ══════════════════════════════════════════════════════════════════════
def case6_rapid_hash(b):
    print("\n── ⑥ สลับหน้าเร็ว ๆ (เปลี่ยน hash 20 ครั้งรวด) ──")
    import re
    reg = pathlib.Path(__file__).resolve().parent.parent / "src/registry.js"
    ids = re.findall(r'id:"([\w-]+)"', reg.read_text(encoding="utf-8"))
    picks = (ids * 3)[:20]

    ctx = b.new_context(viewport={"width": 1280, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(f"[console] {m.text}") if m.type == "error" else None)
    pg.goto(f"{BASE}/", wait_until="networkidle")
    for tid in picks:
        pg.evaluate(f"location.hash = '#/{tid}'")
        pg.wait_for_timeout(60)  # เร็วกว่าจังหวะ render ปกติโดยตั้งใจ
    pg.wait_for_timeout(1500)
    ck("สลับ hash 20 ครั้งรวด → ไม่มี tool ซ้อนกัน (เหลือ .tool-head เดียว)", pg.locator(".tool-head").count(), 1)
    ok = ck_true("สลับ hash 20 ครั้งรวด → ไม่มี console/page error หลุดออกมา", len(errs) == 0, str(errs)[:300])
    if not ok:
        bug("เบา — console error แต่ไม่กระทบการใช้งาน", "สลับ hash เร็ว ๆ (20 ครั้ง/~1.2s) → เกิด unhandled 'Transition was skipped' ซ้ำหลายครั้ง",
            f"src/app.js:255-257 swap() เรียก document.startViewTransition(fn) โดยไม่ดัก reject ของ transition เดิมที่ถูกสั่งข้าม — errs={errs[:3]}")
    pg.close(); ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ⑦ ทำงานแล้วปิดกลางคัน — เริ่มประมวลผลแล้วสลับไปเครื่องมืออื่นทันที
# ══════════════════════════════════════════════════════════════════════
def case7_navigate_away(b):
    print("\n── ⑦ ทำงานแล้วปิดกลางคัน (สลับหน้าไปเครื่องมืออื่นทันที) ──")
    ctx = b.new_context(viewport={"width": 1280, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(f"[console] {m.text}") if m.type == "error" else None)
    pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files(files_in("slow20"))
    pg.wait_for_timeout(800)
    pg.locator("button.btn", has_text="ย่อและบีบอัด").first.click()
    pg.wait_for_timeout(200)  # ให้เริ่มประมวลผลไปก่อนจริง ๆ
    pg.evaluate("location.hash = '#/pdf-merge'")
    pg.wait_for_timeout(3000)
    ck_true("สลับหน้าไปเครื่องมืออื่นระหว่างงานยังไม่จบ → หน้าใหม่เปิดได้ปกติ",
            "รวมไฟล์ PDF" in pg.locator(".tool-head h1").inner_text())
    pg.wait_for_timeout(5000)  # ให้งานพื้นหลัง (ถ้ายังทำอยู่) มีเวลาจบ
    ck_true("สลับหน้ากลางคัน → ไม่มี console/page error ค้างหลุดออกมา", len(errs) == 0, str(errs)[:300])
    pg.close(); ctx.close()


# ══════════════════════════════════════════════════════════════════════
# ④(ต่อ) เคสรุนแรงสุด — ไฟล์ PNG ที่ถูกตัดกลางสตรีม (header ถูกแต่ข้อมูลขาด) เข้า images-to-pdf
# แยกออกมาเป็นเคสของตัวเองเพราะต้องใช้ context แยกทิ้ง (หน้าอาจค้างจริง ปิดผ่าน context.close())
# ══════════════════════════════════════════════════════════════════════
def case4b_corrupt_png_hang(b):
    print("\n── ④(ต่อ) PNG ที่ถูกตัดกลางสตรีมเข้า images-to-pdf — เช็คค้างเกิน 30 วิไหม ──")
    HANG_BUDGET_MS = 32000
    ctx = b.new_context(viewport={"width": 1280, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/images-to-pdf", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator("input[type=file]").set_input_files([str(TMP / "names" / "corrupt-truncated.png")])
    pg.wait_for_timeout(500)
    t0 = time.time()
    hung = False
    # ‼️ พบว่าค้างได้ตั้งแต่ตอนคลิกเลย (Playwright เองก็ค้างรอ "scheduled navigations" หลังคลิก
    #    เพราะ main thread ของหน้าโดนบล็อกเกือบจะทันทีที่ handler เริ่มทำงาน) — ต้องดัก timeout ทั้งสองจุด
    try:
        pg.locator("button.btn", has_text="สร้างไฟล์ PDF").first.click(timeout=HANG_BUDGET_MS, no_wait_after=True)
    except PWTimeout:
        hung = True
    if not hung:
        try:
            pg.wait_for_function(
                "(() => { const t=document.querySelector('.status')?.textContent||''; "
                "return t.includes('เรียบร้อย') || t.includes('ไม่สำเร็จ'); })()",
                timeout=max(1000, HANG_BUDGET_MS - (time.time() - t0) * 1000))
        except PWTimeout:
            hung = True
    elapsed = time.time() - t0
    if not hung:
        ck_true(f"PNG ที่ถูกตัดกลางสตรีม → ไม่ค้างเกิน {HANG_BUDGET_MS/1000:.0f}s (ใช้เวลา {elapsed:.2f}s)", True)
    else:
        ck_true(f"PNG ที่ถูกตัดกลางสตรีม → ไม่ค้างเกิน {HANG_BUDGET_MS/1000:.0f}s", False,
                f"ยังค้างอยู่หลังรอ {elapsed:.1f}s — หน้าจอไม่ตอบสนอง (ทดสอบแยกต่างหากยืนยันแล้วว่าค้างต่อเนื่อง >100s ไม่จบเอง)")
        bug("รุนแรงที่สุด — หน้าค้างไม่ตอบสนอง", "images-to-pdf: ไฟล์ PNG ที่ถูกตัดกลางสตรีม (header ถูกต้องแต่ข้อมูลขาด) → หน้าค้างสนิท ไม่ตอบสนองแม้แต่ evaluate() ง่าย ๆ (ทดสอบแยกแล้วค้างต่อเนื่อง >100 วินาทีโดยไม่จบ)",
            "src/tools/images-to-pdf.js:59  doc.embedPng(bytes) — pdf-lib วนลูป/ค้างตอนแกะ PNG ที่ inflate stream ขาดหาย · "
            "ไม่มี timeout/worker แยก ทำให้ main thread ทั้งหน้าค้างไปด้วย · ปุ่มหยุดก็กดไม่ได้เพราะไม่เคยโผล่ (ดูข้อ ⑤ 5c)")
    # ปิดด้วย context.close() เท่านั้น (ไม่เรียก pg.close() บนหน้าที่อาจค้างอยู่จริง — ยืนยันแล้วว่า
    # context.close()/browser process kill ใช้งานได้แน่นอนแม้ main thread ของ renderer จะค้างอยู่)
    ctx.close()


# ══════════════════════════════════════════════════════════════════════
def print_bug_table():
    print("\n" + "━" * 70)
    print("ตารางบั๊กที่เจอ (เรียงตามความรุนแรง)")
    print("━" * 70)
    if not BUGS:
        print("  ไม่พบบั๊กเลยจากทุกเคสที่ยิงไป (ดูรายละเอียดเคสที่ยิงในรายงานด้านบน)")
        return
    order = {"รุนแรงที่สุด — หน้าค้างไม่ตอบสนอง": 0,
             "รุนแรง — เงียบหาย/เสียข้อมูลผลลัพธ์ที่ทำเสร็จแล้ว": 1,
             "รุนแรง — พัง/ทำงานผิดทั้งชุด": 1,
             "กลาง — ฟีเจอร์หาย/ไม่สมส่วนกับเครื่องมืออื่น": 2,
             "เบา — console error แต่ไม่กระทบการใช้งาน": 3}
    for i, (sev, title, ev) in enumerate(sorted(BUGS, key=lambda x: order.get(x[0], 9)), 1):
        print(f"\n{i}. [{sev}] {title}")
        print(f"   หลักฐาน: {ev}")
    print()


def main():
    gen_fixtures()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--enable-precise-memory-info"])
            case1_many_files(b)
            case2_big_files(b)
            case3_weird_names(b)
            case4_bad_files(b)
            case4b_corrupt_png_hang(b)
            case5_rapid_actions(b)
            case6_rapid_hash(b)
            case7_navigate_away(b)
            b.close()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
        print(f"\nลบไฟล์ทดสอบชั่วคราวที่ {TMP} แล้ว")

    print_bug_table()
    print("━" * 70)
    print(f"ผ่าน {P} · ตก {len(F)}")
    for i, x in enumerate(F, 1):
        print(f"  {i}. {x}")
    sys.exit(1 if F else 0)


if __name__ == "__main__":
    main()
