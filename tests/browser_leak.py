"""หาการรั่วของหน่วยความจำ/ทรัพยากรใน FileKit — จับค่าจริงด้วย Playwright ห้ามเดา

โจทย์: ผู้ใช้เปิดแท็บ FileKit ค้างไว้ทั้งวันแล้วสลับเครื่องมือไปมา (ไม่ reload หน้า)
ถ้า objectURL/listener/DOM/heap รั่วจะสะสมจนแท็บช้าลงเรื่อย ๆ

วิธีวัด (ห้ามเดา ต้องจับค่าจริง):
  - objectURL:  patch URL.createObjectURL / revokeObjectURL ผ่าน page.add_init_script
                นับจำนวนสร้าง/คืน + เก็บ URL ที่ยังไม่คืน (live set)
  - listener:   patch document.addEventListener/removeEventListener และ
                window.addEventListener/removeEventListener นับ net ต่อ type
                (getEventListeners ใช้นอก DevTools ไม่ได้ — ต้อง patch เอง)
  - DOM:        document.querySelectorAll('*').length
  - heap:       performance.memory.usedJSHeapSize (ต้อง --enable-precise-memory-info)
                บังคับ GC ด้วย CDP HeapProfiler.collectGarbage ก่อนวัดทุกครั้ง

ทุกสถานการณ์ขับเคลื่อนด้วย location.hash (เหมือนผู้ใช้กดป้ายเปลี่ยนเครื่องมือจริง)
ไม่ใช่ page.goto() ซ้ำ — ไม่งั้นเท่ากับ reload หน้าทุกครั้ง ไม่ตรงสภาพผู้ใช้จริงที่เปิดแท็บเดียวค้างไว้

ข้อห้ามของงานนี้: ห้ามแก้ src/**, index.html, assets/** — เจอจุดรั่วให้รายงานเฉยๆ ห้ามแก้เอง
"""
import os, sys, time, socket, pathlib, subprocess, urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8924
BASE_ENV = os.environ.get("FK_BASE", "").strip()
BASE = BASE_ENV or f"http://localhost:{PORT}"
SCRATCH = pathlib.Path(
    "/tmp/claude-1000/-mnt-c-Users-USER-Desktop-Claude-Code/"
    "1a23ba41-65a0-437b-a9bd-bf64961a3d72/scratchpad/leak_imgs"
)

# ── ผลรวม + ตัวช่วยพิมพ์ผลแบบเดียวกับเทสอื่นในชุดนี้ ────────────────────────
P, F = 0, []
LEAKS = []  # (severity, name, detail) — ตารางจุดรั่วท้ายรายงาน


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}  (ได้ {got!r} / ควรได้ {want!r})")
    return ok


def ck_true(name, cond, detail=""):
    global P
    if cond:
        P += 1
    else:
        F.append(f"{name}{(' — ' + detail) if detail else ''}")
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({detail})" if detail else ""))
    return cond


def leak(severity, name, detail):
    LEAKS.append((severity, name, detail))
    print(f"      ⚠️ [{severity}] {name} — {detail}")


def section(title):
    print(f"\n{'━' * 70}\n{title}\n{'━' * 70}")


# ── เซิร์ฟเวอร์ 8924 (เสิร์ฟเอง ถ้าไม่ได้ตั้ง FK_BASE จากภายนอก) ──────────────
_server_proc = None


def port_open(host, port, timeout=0.4):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def start_server():
    global _server_proc
    if BASE_ENV:
        print(f"ใช้ FK_BASE ภายนอก: {BASE} (ไม่เปิดเซิร์ฟเวอร์เอง)")
        return
    if port_open("localhost", PORT):
        print(f"‼️ พอร์ต {PORT} มีอะไรฟังอยู่แล้ว — ใช้ของที่มีอยู่ (ไม่เปิดซ้ำ)")
        return
    print(f"เปิดเซิร์ฟเวอร์ {BASE} จาก {ROOT} ...")
    _server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            print("  พร้อมแล้ว")
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"เซิร์ฟเวอร์ {BASE} ไม่ขึ้นภายในเวลาที่กำหนด")


def stop_server():
    if _server_proc:
        _server_proc.terminate()
        try:
            _server_proc.wait(timeout=5)
        except Exception:
            _server_proc.kill()
        print(f"ปิดเซิร์ฟเวอร์ {BASE} แล้ว")


# ── สร้างไฟล์รูปทดสอบ (แยกกันจริง กันปัญหา dedupe ของ input[type=file]) ──────
def make_images(n):
    from PIL import Image
    SCRATCH.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(n):
        p = SCRATCH / f"leak_{i:02d}.png"
        Image.new("RGB", (48, 48), ((i * 37) % 255, (i * 61) % 255, (i * 89) % 255)).save(p)
        paths.append(str(p))
    return paths


PDF_A = str(ROOT / "samples/ตัวอย่าง-รายงานประจำเดือน.pdf")   # 3 หน้า
PDF_B = str(ROOT / "samples/ตัวอย่าง-ใบปะหน้าเอกสาร.pdf")      # 2 หน้า

# ── init script: patch createObjectURL/revokeObjectURL + addEventListener นับจริง ──
INIT_SCRIPT = r"""
(() => {
  const OC = URL.createObjectURL.bind(URL);
  const RV = URL.revokeObjectURL.bind(URL);
  window.__fkURL = { created: 0, revoked: 0, live: new Set() };
  URL.createObjectURL = function (obj) {
    const u = OC(obj);
    window.__fkURL.created++;
    window.__fkURL.live.add(u);
    return u;
  };
  URL.revokeObjectURL = function (u) {
    window.__fkURL.revoked++;
    window.__fkURL.live.delete(u);
    return RV(u);
  };

  window.__fkListen = { document: {}, window: {} };
  function wrap(target, label) {
    const AL = target.addEventListener.bind(target);
    const RL = target.removeEventListener.bind(target);
    target.addEventListener = function (type, ...rest) {
      window.__fkListen[label][type] = (window.__fkListen[label][type] || 0) + 1;
      return AL(type, ...rest);
    };
    target.removeEventListener = function (type, ...rest) {
      window.__fkListen[label][type] = (window.__fkListen[label][type] || 0) - 1;
      return RL(type, ...rest);
    };
  }
  wrap(document, "document");
  wrap(window, "window");
})();
"""


def get_url_stats(page):
    return page.evaluate("() => ({created: window.__fkURL.created, revoked: window.__fkURL.revoked, live: window.__fkURL.live.size})")


def listen_snapshot(page, label, types):
    data = page.evaluate(f"window.__fkListen.{label}")
    return {t: data.get(t, 0) for t in types}


def force_gc(cdp):
    cdp.send("HeapProfiler.enable")
    cdp.send("HeapProfiler.collectGarbage")
    cdp.send("HeapProfiler.collectGarbage")
    cdp.send("HeapProfiler.disable")


def dom_heap(page, cdp, settle_ms=250):
    force_gc(cdp)
    page.wait_for_timeout(settle_ms)
    return page.evaluate(
        "() => ({dom: document.querySelectorAll('*').length, "
        "script: document.querySelectorAll('script').length, "
        "heap: (performance.memory && performance.memory.usedJSHeapSize) || null})"
    )


def goto_tool(page, tool_id, wait_sel=".dz, .tool-head"):
    """สลับเครื่องมือแบบผู้ใช้จริง (เปลี่ยน hash ในแท็บเดียว) — ไม่ใช่ page.goto() ซ้ำ"""
    page.evaluate("(id) => { location.hash = '#/' + id; }", tool_id)
    page.wait_for_selector(wait_sel, timeout=10000)


def goto_home(page):
    page.evaluate("() => { location.hash = '#/'; }")
    page.wait_for_selector("#tools", timeout=10000)


def remove_all_rows(page):
    """กดปุ่มลบไฟล์ทีละแถว (แถวแรกเสมอ เพราะ index เลื่อนหลังลบ) จนกว่าจะหมด"""
    n = 0
    while page.locator(".file-row").count() > 0:
        page.locator(".file-row button.icon-btn.danger").first.click()
        page.wait_for_timeout(60)
        n += 1
        if n > 50:
            break
    return n


def main():
    start_server()
    imgs = make_images(10)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--enable-precise-memory-info"])
            ctx = browser.new_context(viewport={"width": 1280, "height": 950})
            page = ctx.new_page()
            page.add_init_script(INIT_SCRIPT)
            cdp = ctx.new_cdp_session(page)

            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))

            page.goto(BASE, wait_until="networkidle")
            page.wait_for_selector("#tools")

            # ══════════════════════════════════════════════════════════════
            section("0) พิสูจน์เครื่องมือตรวจก่อนเชื่อผล (ต้องแดงเป็น + จับได้จริง)")
            # ══════════════════════════════════════════════════════════════
            # ฉีด objectURL ที่ "ทิ้งไว้ไม่คืน" ตรง ๆ แล้วดูว่าตัวนับจับได้ไหม
            before = get_url_stats(page)
            page.evaluate("""() => {
                window.__poisonBlob = new Blob(['leak-proof'], {type:'text/plain'});
                window.__poisonURL = URL.createObjectURL(window.__poisonBlob);
            }""")
            after_leak = get_url_stats(page)
            ck_true(
                "ฉีด objectURL ทิ้งไว้ 1 ตัว → created +1 และ live +1 (ตัวนับจับได้จริง)",
                after_leak["created"] == before["created"] + 1
                and after_leak["live"] == before["live"] + 1
                and after_leak["revoked"] == before["revoked"],
                f"created {before['created']}→{after_leak['created']} · live {before['live']}→{after_leak['live']}",
            )
            # แล้วคืนของที่ฉีดไปตามหลังให้ตัวนับ revoked ขยับตามจริง (พิสูจน์ทั้งสองทาง)
            page.evaluate("() => URL.revokeObjectURL(window.__poisonURL)")
            after_fix = get_url_stats(page)
            ck_true(
                "revoke ตัวที่ฉีดไว้ → revoked +1, live กลับที่เดิม (ตัวนับไม่ค้าง/ไม่โป้ปดตัวเลข)",
                after_fix["revoked"] == after_leak["revoked"] + 1
                and after_fix["live"] == before["live"],
                f"revoked {after_leak['revoked']}→{after_fix['revoked']} · live {after_leak['live']}→{after_fix['live']}",
            )

            # ══════════════════════════════════════════════════════════════
            section("1) objectURL — ใส่รูป 10 ใบ → ลบทีละใบ → ต้องคืนครบ (image-convert)")
            # ══════════════════════════════════════════════════════════════
            goto_tool(page, "image-convert")
            before = get_url_stats(page)
            page.locator("input[type=file]").first.set_input_files(imgs)
            page.wait_for_function(
                "() => document.querySelectorAll('.file-row').length === 10", timeout=8000
            )
            page.wait_for_timeout(500)  # รอ thumbnail (createObjectURL) วาดเสร็จ
            after_add = get_url_stats(page)
            created_for_10 = after_add["created"] - before["created"]
            ck_true(
                "เพิ่มรูป 10 ใบ → createObjectURL ถูกเรียก 10 ครั้ง (1 ต่อภาพย่อ)",
                created_for_10 == 10, f"สร้างจริง {created_for_10} ครั้ง",
            )
            n_removed = remove_all_rows(page)
            page.wait_for_timeout(150)
            after_remove = get_url_stats(page)
            revoked_for_10 = after_remove["revoked"] - before["revoked"]
            ok1 = ck_true(
                f"ลบครบ {n_removed} แถว → revokeObjectURL ถูกเรียกครบ {created_for_10} ครั้ง (ไม่รั่ว)",
                revoked_for_10 == created_for_10,
                f"revoke จริง {revoked_for_10}/{created_for_10} · live คงค้าง {after_remove['live'] - before['live']}",
            )
            if not ok1:
                leak("สูง", "ลบไฟล์ทีละใบใน dropzone ไม่คืน objectURL ครบ",
                     f"src/ui.js remove()/revokeThumb — สร้าง {created_for_10} คืนจริง {revoked_for_10}")

            # ══════════════════════════════════════════════════════════════
            section("2) objectURL — ใส่รูป → เปลี่ยนไปเครื่องมืออื่น (ไม่ลบไฟล์ก่อน) → ต้องคืน")
            # ══════════════════════════════════════════════════════════════
            # image-resize มี thumbnail ของตัวเอง (thumbs:false ที่ dropzone) — เพิ่ม createObjectURL
            # เอง 1 ต่อไฟล์ในแกลเลอรี + อีก 1 สำหรับพรีวิว "หลัง" ของไฟล์ที่กำลังโฟกัส (auto-preview)
            goto_tool(page, "image-resize")
            before2 = get_url_stats(page)
            page.locator("input[type=file]").first.set_input_files(imgs[:3])
            page.wait_for_function(
                "() => document.querySelectorAll('.file-row').length === 3", timeout=8000
            )
            page.wait_for_timeout(600)  # รอ auto-preview (updatePreview) คำนวณเสร็จด้วย
            after_add2 = get_url_stats(page)
            created2 = after_add2["created"] - before2["created"]
            ck_true(
                "เพิ่มรูป 3 ใบใน image-resize → createObjectURL อย่างน้อย 3 ครั้ง "
                "(3 thumbnail + 1 auto-preview 'หลัง' ของไฟล์ที่กำลังโฟกัส)",
                created2 >= 3, f"ได้ {created2}",
            )

            goto_tool(page, "pdf-merge")   # สลับไปเครื่องมืออื่น "โดยไม่ลบไฟล์ก่อน"
            page.wait_for_timeout(300)
            after_switch2 = get_url_stats(page)
            revoked2 = after_switch2["revoked"] - before2["revoked"]
            ok2 = ck_true(
                "สลับเครื่องมือทั้งที่ยังมีรูปค้างอยู่ → objectURL ของภาพย่อ/พรีวิวควรถูกคืน",
                revoked2 == created2,
                f"สร้าง {created2} · คืนจริงตอนสลับ {revoked2} · live เพิ่มขึ้น {after_switch2['live'] - before2['live']}",
            )
            if not ok2:
                leak("สูง", "สลับเครื่องมือทั้งที่มีไฟล์ค้าง ไม่คืน objectURL ของภาพย่อ/พรีวิวเลย",
                     f"src/app.js:253 mounted Map แคช DOM ของทุกเครื่องมือที่เคยเปิดไว้ถาวร (ไม่มีจุดเคลียร์/ไม่มี dispose hook) "
                     f"→ src/tools/image-resize.js:218-227 (thumbUrls) และ :334-335 (afterUrl) เป็น state ภายใน closure ของ "
                     f"mount() เดิม ไม่เคยถูก revoke ตอนหลุดจอ (เทียบกับ src/ui.js dropzone() thumbUrls ก็ปัญหาเดียวกัน) "
                     f"— สร้าง {created2} ใบ คืนจริง {revoked2} ใบ หลังสลับออกจากเครื่องมือ")

            # ══════════════════════════════════════════════════════════════
            section("3) ตัวดูรูปเต็มจอ (coverflow) — เปิด เลื่อนดูทั้งชุด แล้วปิด → ต้องคืนครบ")
            # ══════════════════════════════════════════════════════════════
            # ใช้ image-convert (thumbs:true ค่าเริ่มต้น) — มีปุ่ม .thumb ให้กดเปิดตัวดูรูปได้จริง
            # (image-resize ปิด thumbs:false ไว้เพราะมีแกลเลอรีของตัวเองแล้ว — ไม่มีปุ่มเปิด viewer)
            goto_tool(page, "image-convert")
            remove_all_rows(page)  # เคลียร์ของเก่าจาก scenario 1 ก่อน (กันปนกัน)
            page.wait_for_timeout(150)
            before3 = get_url_stats(page)
            page.locator("input[type=file]").first.set_input_files(imgs)  # 10 ใบ
            page.wait_for_function(
                "() => document.querySelectorAll('.file-row').length === 10", timeout=8000
            )
            page.wait_for_timeout(400)
            after_thumb3 = get_url_stats(page)

            page.locator(".file-row button.thumb").first.click()
            page.wait_for_selector("dialog.pv[open]", timeout=5000)
            page.wait_for_timeout(200)
            # เลื่อนดูให้ทั่วทั้งชุด (coverflow ต้อง mount/unmount การ์ดข้าง ๆ ตลอดทาง)
            for _ in range(9):
                page.keyboard.press("ArrowRight")
                page.wait_for_timeout(180)
            peak = get_url_stats(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            after_close3 = get_url_stats(page)

            created3 = peak["created"] - after_thumb3["created"]  # เฉพาะที่ viewer สร้างเพิ่ม
            revoked3 = after_close3["revoked"] - after_thumb3["revoked"]
            ok3 = ck_true(
                "ปิดตัวดูรูปแล้ว objectURL ที่ viewer สร้างระหว่างเลื่อนดูถูกคืนครบ",
                after_close3["live"] == after_thumb3["live"],
                f"viewer สร้างเพิ่ม {created3} · คืนหลังปิด {revoked3} · live ก่อนเปิด {after_thumb3['live']} หลังปิด {after_close3['live']}",
            )
            if not ok3:
                leak("กลาง", "ปิดตัวดูรูปเต็มจอ (coverflow) แล้ว objectURL ไม่คืนครบ",
                     f"src/preview.js close/resetGallery — live ก่อนเปิด {after_thumb3['live']} หลังปิด {after_close3['live']}")

            remove_all_rows(page)
            page.wait_for_timeout(150)

            # ══════════════════════════════════════════════════════════════
            section("4) ดาวน์โหลดผลลัพธ์ (images-to-pdf) → ต้องคืน objectURL (ของเดิมหน่วง 10 วิ)")
            # ══════════════════════════════════════════════════════════════
            goto_tool(page, "images-to-pdf")
            page.locator("input[type=file]").first.set_input_files(imgs[:2])
            page.wait_for_function(
                "() => document.querySelectorAll('.file-row').length === 2", timeout=8000
            )
            page.get_by_role("button", name="สร้างไฟล์ PDF").click()
            page.wait_for_selector(".result", timeout=15000)
            page.wait_for_timeout(200)
            # ‼️ นับเฉพาะรอบ "กดดาวน์โหลด" เท่านั้น — ไม่เทียบกับ before ทั้ง scenario เพราะไฟล์ 2 ใบ
            #    ที่ยังนอนอยู่ใน dropzone มี objectURL ภาพย่อของตัวเองที่ "ยังไม่ควรถูกคืน" (ไฟล์ยังอยู่จริง)
            #    ต้อง isolate เฉพาะ objectURL ที่ download() สร้างตอนกดปุ่มเท่านั้น
            before_click4 = get_url_stats(page)
            page.get_by_role("button", name="ดาวน์โหลด").click()
            page.wait_for_timeout(300)
            just_after_dl = get_url_stats(page)
            created4 = just_after_dl["created"] - before_click4["created"]
            ck_true(
                "กดดาวน์โหลด → createObjectURL ของไฟล์ผลลัพธ์ถูกสร้าง 1 ครั้ง (ยังไม่ revoke ทันที)",
                created4 == 1 and just_after_dl["revoked"] == before_click4["revoked"],
                f"สร้าง {created4} · revoke ทันที {just_after_dl['revoked'] - before_click4['revoked']}",
            )
            # src/ui.js download(): setTimeout(revoke, 10000) — ของเดิมตั้งใจหน่วง 10 วิ ไม่ใช่บั๊ก
            # แต่ต้องพิสูจน์ด้วยตาว่า "คืนจริง" หลังพ้นเวลานั้น ไม่ใช่เดา
            page.wait_for_timeout(10700)
            after_wait4 = get_url_stats(page)
            revoked4 = after_wait4["revoked"] - just_after_dl["revoked"]
            live_delta4 = after_wait4["live"] - just_after_dl["live"]
            ok4 = ck_true(
                "ผ่านไป >10 วิหลังดาวน์โหลด → objectURL ของไฟล์ผลลัพธ์ (เฉพาะตัวที่ดาวน์โหลด) ถูกคืนแล้ว",
                revoked4 == 1 and live_delta4 == -1,
                f"revoke เพิ่ม {revoked4} (ควร 1) · live เปลี่ยน {live_delta4} (ควร -1) "
                f"— live รวมทั้งหน้า {just_after_dl['live']}→{after_wait4['live']} (ไฟล์ภาพย่อ 2 ใบที่ยังอยู่ในกล่องไม่นับเป็นรั่ว)",
            )
            if not ok4:
                leak("ต่ำ", "objectURL ของไฟล์ที่ดาวน์โหลดไม่คืนแม้รอเกิน 10 วิ",
                     f"src/ui.js:26-31 download() — revoke เพิ่ม {revoked4} (ควร 1) หลังรอ 10.7 วิ")

            # ══════════════════════════════════════════════════════════════
            section("5) PDF canvas — pdf-pages โหลดพรีวิวทุกหน้า สลับไฟล์/โหลดซ้ำ ต้องไม่สะสม")
            # ══════════════════════════════════════════════════════════════
            # ‼️ เทียบ "สภาพว่าง" กับ "สภาพโหลดแล้ว" ตรง ๆ ไม่ได้ (ปุ่ม/ไอคอนที่เปิดใช้งานหลังโหลดไฟล์
            #    ทำให้ DOM ต่างกันเป็นปกติอยู่แล้ว ไม่ใช่รั่ว) — ต้องเทียบ "โหลดไฟล์เดียวกันซ้ำ" ระหว่างรอบ
            #    ต่อรอบแทน ถ้ารั่วจริงตัวเลขของไฟล์เดิมจะไต่ขึ้นเรื่อย ๆ ทุกครั้งที่วนกลับมาโหลดมันใหม่
            goto_tool(page, "pdf-pages")
            dom_per_round = []
            heap_per_round = []
            for i, pdf_path in enumerate([PDF_A, PDF_B, PDF_A, PDF_B, PDF_A]):
                expect_pages = 3 if pdf_path == PDF_A else 2
                page.locator("input[type=file]").first.set_input_files(pdf_path)
                page.wait_for_function(
                    f"() => document.querySelectorAll('.pg').length === {expect_pages}", timeout=15000
                )
                page.wait_for_timeout(150)
                n_pages = page.locator(".pg").count()
                ck(f"รอบที่ {i+1}: โหลด {'A(3หน้า)' if pdf_path==PDF_A else 'B(2หน้า)'} → เห็น {expect_pages} การ์ดหน้า (ไม่ทบจากรอบก่อน)",
                   n_pages, expect_pages)
                dh = dom_heap(page, cdp, settle_ms=100)
                dom_per_round.append(dh["dom"])
                heap_per_round.append(dh["heap"])

            print(f"  DOM ต่อรอบ (A,B,A,B,A): {dom_per_round}")
            if all(h is not None for h in heap_per_round):
                print(f"  heap ต่อรอบ (A,B,A,B,A) หลัง GC: {[f'{h:,}' for h in heap_per_round]}")

            # รอบ 1,3,5 คือไฟล์ A ซ้ำ (3 หน้าเท่ากันทุกรอบ) — DOM ต้องเท่ากันเป๊ะถ้าไม่รั่ว
            dom_A = [dom_per_round[0], dom_per_round[2], dom_per_round[4]]
            dom_B = [dom_per_round[1], dom_per_round[3]]
            ok5 = ck_true(
                "โหลดไฟล์ A ซ้ำ 3 รอบ (รอบ 1,3,5) → จำนวนโหนด DOM เท่ากันทุกรอบ (ไม่ไต่ขึ้นเรื่อย ๆ)",
                dom_A[0] == dom_A[1] == dom_A[2],
                f"DOM รอบ 1/3/5 = {dom_A}",
            )
            ck_true(
                "โหลดไฟล์ B ซ้ำ 2 รอบ (รอบ 2,4) → จำนวนโหนด DOM เท่ากันทุกรอบ",
                dom_B[0] == dom_B[1],
                f"DOM รอบ 2/4 = {dom_B}",
            )
            if not ok5:
                leak("กลาง", "pdf-pages โหลดไฟล์เดิมซ้ำแล้ว DOM node ของรอบหลังมากกว่ารอบแรก (canvas/การ์ดเก่าไม่ถูกล้างหมด)",
                     f"src/tools/pdf-pages.js loadPreview() — DOM ไฟล์ A รอบ 1/3/5 = {dom_A}")

            # ══════════════════════════════════════════════════════════════
            section("6) event listener ค้าง — สลับเครื่องมือ 20 รอบ (20 ตัวใหม่ ไม่เคยเปิดมาก่อน)")
            section("   โดยไม่ยิง drag/paste event เลย ตามสภาพจริงที่คนคลิกเปลี่ยนเครื่องมือเฉย ๆ")
            # ══════════════════════════════════════════════════════════════
            DRAG_TYPES = ["dragenter", "dragover", "dragleave", "drop", "paste"]
            # 19 เครื่องมือที่มี dropzone จริงและยังไม่เคยเปิดในเทสรอบนี้เลย (กันไม่ให้ปนกับ scenario 1-5
            # ที่เปิด image-convert/image-resize/images-to-pdf/pdf-pages/pdf-merge ไปแล้ว — เครื่องมือที่
            # เคย mount แล้วจะถูกดึงจากแคช mounted ไม่สร้าง listener ใหม่ ทำให้วัด "รั่วจากการสลับ" ไม่ตรง)
            # ตัวสุดท้ายวนกลับไปเปิดตัวแรกซ้ำ ให้ครบ "สลับ 20 รอบ" ตามโจทย์ (ตัวที่ 20 ไม่ควรเพิ่ม listener
            # เพราะเป็นของที่เพิ่งเปิดไปแล้วในรอบที่ 1 — ถ้าเพิ่มขึ้นอีกแปลว่ารั่วรุนแรงกว่านั้น)
            TOOLS_19_UNIQUE = [
                "pdf-compress", "pdf-ocr", "pdf-sign", "pdf-split",
                "pdf-to-excel", "pdf-to-images", "pdf-to-text", "pdf-to-word", "pdf-watermark",
                "powerpoint-to-pdf", "powerpoint-to-word", "thai-encoding", "word-clean",
                "word-join", "word-mailmerge", "word-replace", "word-to-pdf",
                "excel-csv", "excel-to-pdf",
            ]
            ck("จำนวนเครื่องมือใหม่ (ไม่เคยเปิดมาก่อน) ที่จะใช้ทดสอบรอบนี้ = 19 ตัว", len(TOOLS_19_UNIQUE), 19)
            TOOLS_20 = TOOLS_19_UNIQUE + [TOOLS_19_UNIQUE[0]]  # รอบที่ 20 = วนกลับไปเปิดตัวแรกซ้ำ ครบ "20 รอบ"

            before6 = listen_snapshot(page, "document", DRAG_TYPES)
            d_before6 = dom_heap(page, cdp)

            # ‼️ เก็บ DOM ตอนอยู่บนเครื่องมือ "ตัวเดียวกัน" ทั้งรอบแรก (index 0) และรอบสุดท้ายที่วนกลับมา
            #    (index 19 = revisit ตัวเดิม) ไว้เทียบแบบ apples-to-apples — เทียบ DOM ก่อนลูปทั้งหมด
            #    (ซึ่งเป็นเครื่องมือคนละตัวกับตอนจบลูป) ไม่ได้ความจริงอะไร เพราะแต่ละเครื่องมือมี DOM
            #    ไม่เท่ากันโดยธรรมชาติอยู่แล้ว (บทเรียนจาก scenario 5 ที่แก้ไปแล้ว)
            snap_first = snap_last = None
            for i, tid in enumerate(TOOLS_20):
                goto_tool(page, tid)
                if i == 0:
                    snap_first = dom_heap(page, cdp, settle_ms=100)
                elif i == len(TOOLS_20) - 1:
                    snap_last = dom_heap(page, cdp, settle_ms=100)

            after6 = listen_snapshot(page, "document", DRAG_TYPES)
            d_after6 = dom_heap(page, cdp)

            print(f"  listener document ก่อน: {before6}")
            print(f"  listener document หลัง: {after6}")
            growth = {t: after6[t] - before6[t] for t in DRAG_TYPES}
            print(f"  ผลต่าง (ต้องเป็น 0 ถ้าเก็บกวาดตัวเองทันทีตอนสลับ): {growth}")

            leaked_types = {t: g for t, g in growth.items() if g > 0}
            ok6 = ck_true(
                f"สลับ 20 เครื่องมือโดยไม่มี drag/paste เลย → listener บน document ต้อง 'ไม่' ค้างเพิ่ม (คาดหวังกันเอง = 0)",
                all(g == 0 for g in growth.values()),
                f"ที่จริงเพิ่มขึ้น: {leaked_types}",
            )
            if not ok6:
                worst_type = max(growth, key=growth.get)
                leak("สูง",
                     f"สลับเครื่องมือ 20 รอบ (ไม่มี drag/paste คั่น) → listener '{worst_type}' บน document ค้างเพิ่ม {growth[worst_type]} ตัว (คาดคือทุก type ในชุด {DRAG_TYPES})",
                     "src/ui.js:284-338 dropzone() ผูก dragenter/dragover/dragleave/drop/paste ไว้ที่ document ใหม่ทุกครั้งที่ "
                     "mount เครื่องมือ · โค้ดออกแบบให้ 'ตัวเองถอดตัวเอง' ก็ต่อเมื่อมี event ประเภทเดียวกันยิงเข้ามาอีกครั้งและ "
                     "zone.isConnected===false (ui.js:335-341) — ถ้าไม่มี drag/paste เกิดขึ้นเลยหลังสลับ listener ค้างสะสมไม่จำกัด "
                     f"เก็บ closure ที่อ้าง DOM เก่า (zone/list/thumbUrls) ไว้ด้วย · วัดจริง: {growth}")

            # ── ทดสอบ self-heal: ยิง event ประเภทที่ค้างอยู่ 1 ครั้งบน document ───
            # (ยืนยันว่า "รั่วชั่วคราว" ไม่ใช่ "รั่วถาวร" — ต้องพิสูจน์ด้วยตาไม่ใช่เดา)
            # ‼️ จับได้จริงจากค่าที่วัด: src/app.js:191-213 ผูก dragenter/dragover/dragleave/drop/paste
            #    ไว้ที่ document แบบถาวร 1 ชุด (ฟีเจอร์ "ลากไฟล์ลงหน้าแรก") อยู่แล้วเป็นปกติไม่เกี่ยวกับบั๊กนี้
            #    ดังนั้นหลัง self-heal ที่ "ถูกต้อง" จะเหลือ 2 ตัวเสมอ (1 permanent ของหน้าแรก + 1 ของเครื่องมือ
            #    ที่กำลังเปิดอยู่ตอนนี้) ไม่ใช่ 0 หรือ 1 — ตรวจสอบจาก baseline ก่อนเข้าลูป (before6 == 6 ตอนรันจริง
            #    = 5 เครื่องมือที่เคยเปิดใน scenario 1-5 + 1 permanent พอดี)
            fire_type = DRAG_TYPES[0]
            page.evaluate("(t) => document.dispatchEvent(new Event(t))", fire_type)
            page.wait_for_timeout(150)
            after_heal = listen_snapshot(page, "document", DRAG_TYPES)
            print(f"  listener document หลังยิง 1 เหตุการณ์ '{fire_type}' สังเคราะห์: {after_heal}")
            self_heals = all(after_heal[t] == 2 for t in DRAG_TYPES)  # 1 permanent (app.js) + 1 เครื่องมือปัจจุบัน
            ck_true(
                f"ยิง '{fire_type}' 1 ครั้งบน document (จำลองการลาก/วางไฟล์ทั่วไป) → listener ที่ค้างสะสมทั้ง 20 "
                f"ถูกล้างในทีเดียว (เหลือแค่ 2 = ตัวถาวรของหน้าแรก + ของเครื่องมือปัจจุบัน)",
                self_heals,
                f"หลังยิง: {after_heal}",
            )

            print(f"  DOM บนเครื่องมือ '{TOOLS_20[0]}' รอบแรก (index 0) = {snap_first} · "
                  f"รอบที่วนกลับมา (index 19, revisit ตัวเดิม) = {snap_last}")
            dom_growth6 = snap_last["dom"] - snap_first["dom"]
            script_growth6 = snap_last["script"] - snap_first["script"]
            # ‼️ ไล่จริงแล้วพบว่าโตจาก <script> ที่ src/loader.js (loadLibs) แปะเข้า <head> ให้ไลบรารีหนัก
            #    ของแต่ละเครื่องมือ (docx/xlsx/mammoth/jspdf/tesseract ฯลฯ) — เป็นของที่ตั้งใจให้แคชถาวร
            #    ไม่ใช่ถูกสร้างซ้ำทุกครั้งที่ revisit "pdf-compress" เอง (พิสูจน์แล้วว่าไม่ใช่การรั่วของ
            #    เครื่องมือนั้น ๆ) — หักจำนวน <script>/<style> ที่โตออกก่อนแล้วดูส่วนที่เหลือ
            dom_growth_excl_script6 = dom_growth6 - script_growth6
            ck_true(
                f"กลับมาเปิด '{TOOLS_20[0]}' ซ้ำหลังสลับผ่านอีก 19 เครื่องมือ → DOM node ที่ไม่ใช่ <script> โตเพิ่มขึ้นน้อยมาก "
                "(ส่วนต่างที่เหลือคือ <script> ไลบรารีของ 19 เครื่องมือที่ loader.js แปะสะสมไว้ ซึ่งตั้งใจให้แคชถาวร ไม่ใช่รั่ว)",
                abs(dom_growth_excl_script6) <= 5,
                f"DOM รวม Δ{dom_growth6:+d} (ในนั้นเป็น <script> ที่เพิ่ม Δ{script_growth6:+d} ตัว) "
                f"→ ส่วนที่เหลือ (DOM จริงของ pdf-compress เอง) Δ{dom_growth_excl_script6:+d}",
            )

            heap_before6, heap_after6 = d_before6["heap"], d_after6["heap"]
            if heap_before6 is not None and heap_after6 is not None:
                heap_growth6 = heap_after6 - heap_before6
                print(f"  heap ก่อน pass 1: {heap_before6:,} bytes · หลัง pass 1: {heap_after6:,} bytes · Δ{heap_growth6:+,} bytes")
            else:
                heap_growth6 = None
                ck_true("performance.memory มีให้วัด (ต้องรัน Chromium ด้วย --enable-precise-memory-info)", False,
                        "ไม่มี performance.memory — เช็ค flag เปิด browser")

            # ── pass 2: เปิดเครื่องมือ 19 ตัวเดิมซ้ำอีกรอบ (ตอนนี้ถูกแคชใน mounted ครบแล้ว) ─────────
            # เพื่อ "แยก" ต้นทุนที่เกิดครั้งเดียว (โหลดไลบรารีหนักของ Word/Excel/PPT ครั้งแรก — เป็นเรื่อง
            # ปกติที่ตั้งใจให้แคชไว้ ไม่ใช่บั๊ก) ออกจาก "รั่วต่อรอบ" จริง ๆ — ถ้าสลับซ้ำแล้ว listener/heap
            # ยังโตต่อเรื่อย ๆ อีก แปลว่ารั่วไม่มีเพดานจริง ถ้าราบ (ใกล้ 0) แปลว่ารั่วรอบแรกเป็น "ค้างตลอด
            # session" (เพราะ mounted Map ไม่เคยปล่อยของ) แต่ไม่ทบต่อการ "เปิดซ้ำ" เครื่องมือเดิม
            before_pass2 = listen_snapshot(page, "document", DRAG_TYPES)
            d_before_pass2 = dom_heap(page, cdp)
            for tid in TOOLS_19_UNIQUE:
                goto_tool(page, tid)
            after_pass2 = listen_snapshot(page, "document", DRAG_TYPES)
            d_after_pass2 = dom_heap(page, cdp)
            growth_pass2 = {t: after_pass2[t] - before_pass2[t] for t in DRAG_TYPES}
            dom_growth_pass2 = d_after_pass2["dom"] - d_before_pass2["dom"]
            print(f"  pass 2 (เปิดซ้ำ 19 ตัวเดิม) — ผลต่าง listener: {growth_pass2} · DOM Δ{dom_growth_pass2:+d}")
            ck_true(
                "เปิดเครื่องมือเดิม 19 ตัวซ้ำรอบสอง (แคชแล้วทั้งหมด) → listener บน document ไม่เพิ่มอีกเลย "
                "(ยืนยันว่า dropzone() ไม่ถูกสร้างใหม่ตอนกลับไปเปิดเครื่องมือที่แคชไว้แล้ว)",
                all(g == 0 for g in growth_pass2.values()),
                f"{growth_pass2}",
            )
            if heap_growth6 is not None:
                d2h = dom_heap(page, cdp)
                heap_growth_pass2 = d2h["heap"] - heap_after6
                print(f"  heap หลัง pass 2: {d2h['heap']:,} bytes · Δรอบสอง {heap_growth_pass2:+,} bytes "
                      f"(เทียบกับ Δรอบแรก {heap_growth6:+,} bytes)")
                ck_true(
                    "heap หลังเปิดเครื่องมือเดิมซ้ำ (pass 2) โตน้อยกว่ารอบแรกมาก "
                    "(ยืนยันว่าก้อนใหญ่ของรอบแรกคือ 'ต้นทุนครั้งแรก' ของไลบรารี/DOM ไม่ใช่รั่วไม่มีเพดานทุกครั้งที่เปิด)",
                    heap_growth_pass2 < heap_growth6 * 0.35,
                    f"รอบสอง Δ{heap_growth_pass2:+,} เทียบรอบแรก Δ{heap_growth6:+,}",
                )
                leak("กลาง",
                     "mounted Map ไม่เคยปล่อย DOM+closure ของเครื่องมือที่เคยเปิด แม้เลิกใช้แล้ว (heap ค้างตลอด session)",
                     f"src/app.js:253 — heap รอบแรก (เปิด 19 เครื่องมือใหม่) โต Δ{heap_growth6:+,} bytes และไม่ลดลงแม้ไม่ได้ใช้ "
                     f"เครื่องมือเหล่านั้นแล้ว (pass 2 เปิดซ้ำเครื่องมือเดิม 19 ตัวโตแค่ Δ{heap_growth_pass2:+,} bytes ยืนยันว่า "
                     f"ก้อนใหญ่ของรอบแรกส่วนหนึ่งเป็นต้นทุนโหลดไลบรารี Word/Excel/PPT ครั้งแรกซึ่งตั้งใจให้แคชไว้ ไม่ใช่บั๊ก "
                     f"— แต่ตัว mounted Map เองไม่มีจุดปล่อยเลยตลอด session จึงยังนับเป็นความเสี่ยงเมื่อผู้ใช้เปิดหลายสิบเครื่องมือ "
                     f"ในวันเดียว ประกอบกับ closure ของ dropzone/thumbUrls/state รายเครื่องมือที่ไม่มีจุดปล่อยเลย (ยืนยันแล้วจาก scenario 2)")

            # ══════════════════════════════════════════════════════════════
            section("สรุป error บนหน้าเว็บระหว่างทดสอบทั้งหมด (ต้องไม่มี)")
            # ══════════════════════════════════════════════════════════════
            # "Transition was skipped" = document.startViewTransition() (src/app.js:256-257) ถูกยกเลิก
            # เพราะเทสสลับเครื่องมือถี่กว่ามนุษย์กดจริงมาก (ไม่รอ transition เดิมจบ) — ไม่เกี่ยวกับหน่วยความจำ/
            # ทรัพยากรรั่วที่งานนี้ตามหา (ไม่มี objectURL/listener/DOM node ค้างจากมัน) จึงกรองออกจากผลนับ
            # error แต่ยังพิมพ์ไว้ให้เห็นว่าเกิดจริงกี่ครั้ง ไม่ได้ซ่อน
            noise = [e for e in errs if "transition was skipped" in e.lower()]
            real_errs = [e for e in errs if "favicon" not in e.lower() and "transition was skipped" not in e.lower()]
            if noise:
                print(f"  (หมายเหตุ: มี 'Transition was skipped' {len(noise)} ครั้งจากสลับเครื่องมือถี่ระหว่างเทส "
                      f"— ไม่ใช่การรั่วของทรัพยากร ไม่นับเป็น error)")
            ck_true("ไม่มี pageerror ระหว่างทดสอบทั้งหมด", not real_errs, "; ".join(real_errs[:3]))

            ctx.close()
            browser.close()
    finally:
        stop_server()

    # ══════════════════════════════════════════════════════════════════════
    print(f"\n{'═'*70}")
    print(f"ผ่าน {P} · ตก {len(F)}")
    if F:
        print("\nรายการที่ตก:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")

    print(f"\n{'═'*70}\nตารางจุดรั่ว (เรียงตามความรุนแรง)\n{'═'*70}")
    order = {"สูง": 0, "กลาง": 1, "ต่ำ": 2}
    if LEAKS:
        for sev, name, detail in sorted(LEAKS, key=lambda x: order.get(x[0], 9)):
            print(f"  [{sev}] {name}")
            print(f"        {detail}")
    else:
        print("  ไม่พบจุดรั่ว — สถานการณ์ที่ทดสอบไปทั้งหมด:")
        print("  1. เพิ่มรูป 10 ใบ แล้วลบทีละใบ (image-convert) — วัด createObjectURL/revokeObjectURL")
        print("  2. เพิ่มรูปแล้วสลับเครื่องมือโดยไม่ลบไฟล์ก่อน (image-resize → pdf-merge)")
        print("  3. เปิดตัวดูรูปเต็มจอแบบ coverflow เลื่อนดู 9 ครั้งแล้วปิด (Esc)")
        print("  4. สร้าง PDF แล้วดาวน์โหลด รอ >10 วิ ตามดีไซน์เดิม")
        print("  5. โหลด PDF ซ้ำ 5 รอบสลับไฟล์ใน pdf-pages (canvas preview ทุกหน้า)")
        print("  6. สลับเครื่องมือ 20 ตัวรวด (ไม่ยิง drag/paste คั่น) วัด listener/DOM/heap")

    print()
    sys.exit(1 if F else 0)


if __name__ == "__main__":
    main()
