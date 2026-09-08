"""วางไฟล์จากคลิปบอร์ด — ล็อกบั๊กที่พี่ปอนด์เจอเอง 08/09/2026

บั๊ก: แคปหน้าจอด้วย Win+Shift+S แล้วกด Ctrl+V ที่หน้าแรก → ไม่มีอะไรเกิดขึ้นเลย
สาเหตุจริง: ภาพที่แคปมาถึงเบราว์เซอร์เป็น "รูปดิบ" ไม่ใช่ไฟล์ จึงไม่อยู่ใน
clipboardData.files (ที่โค้ดอ่านอยู่ทางเดียว) แต่ไปอยู่ใน clipboardData.items แทน

‼️ บทเรียน: เทสรอบก่อนจำลอง clipboard ด้วย DataTransfer ที่ใส่ File "มีชื่อ" ลงไป
   ซึ่ง populate ทั้ง files และ items → ผ่านทั้งที่ของจริงพัง
   เทสนี้จึงจำลองให้ตรงของจริง: มีแต่ items · ไม่มี files · ไฟล์ไม่มีชื่อ
"""
import os, sys, base64, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = base64.b64encode((ROOT / "samples/ตัวอย่าง-รูปภาพ-2.png").read_bytes()).decode()

# จำลองคลิปบอร์ดแบบที่ Windows ส่งมาจริงตอนแคปหน้าจอ
PASTE_LIKE_WINDOWS = """(b64)=>{
  const bin=atob(b64); const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  const file=new File([new Blob([u],{type:'image/png'})],'image.png',{type:'image/png'});  // ชื่อโหลที่ Chrome ตั้งให้เอง
  const fake={files:[], items:[{kind:'file',type:'image/png',getAsFile:()=>file}]};
  const ev=new Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(ev,'clipboardData',{value:fake});
  document.dispatchEvent(ev);}"""

# วางข้อความธรรมดา — ต้องไม่ไปกวนอะไร (คนก๊อปคำค้นมาวางในช่องค้นหาเป็นเรื่องปกติ)
PASTE_TEXT = """()=>{
  const fake={files:[], items:[{kind:'string',type:'text/plain',getAsFile:()=>null}]};
  const ev=new Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(ev,'clipboardData',{value:fake});
  document.dispatchEvent(ev);}"""

# ถอดการอ่าน items ออกกลางอากาศ = จำลองโค้ดเวอร์ชันที่มีบั๊ก (พิสูจน์ว่าเทสแดงเป็น)
BREAK_DOM_JS = 'if (it.kind === "file") push(it.getAsFile());'

passed, failed = 0, []
def ck(msg, ok, extra=""):
    global passed
    if ok: passed += 1; print(f"  ✅ {msg}")
    else: failed.append(msg); print(f"  ❌ {msg}{extra}")

def run(pg, broken=False):
    """คืน (ชื่อไฟล์ที่หน้าแรกรับได้, ชื่อไฟล์ที่หน้าเครื่องมือรับได้)"""
    if broken:
        def patch(route):
            body = route.request.url
            r = route.fetch()
            route.fulfill(response=r, body=r.text().replace(BREAK_DOM_JS, ""))
        pg.route("**/src/dom.js", patch)

    pg.goto(f"{BASE}/", wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.evaluate(PASTE_LIKE_WINDOWS, IMG); pg.wait_for_timeout(800)
    home = pg.eval_on_selector(".drop-what b", "e=>e.textContent") if pg.locator(".drop-what b").count() else ""

    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle"); pg.wait_for_timeout(900)
    pg.evaluate(PASTE_LIKE_WINDOWS, IMG); pg.wait_for_timeout(900)
    tool = pg.eval_on_selector(".file-row .f-name", "e=>e.textContent") if pg.locator(".file-row .f-name").count() else ""
    return home, tool

with sync_playwright() as p:
    b = p.chromium.launch()

    print("━━ ① คลิปบอร์ดแบบที่ Windows ส่งจริง (items อย่างเดียว ไฟล์ไม่มีชื่อ) ━━")
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    home, tool = run(pg)
    ck("หน้าแรก: วางแล้วต้องขึ้นแถบ 'ไฟล์ของคุณ…' พร้อมชื่อไฟล์", bool(home), f" (ได้ {home!r})")
    # ‼️ Chrome ตั้งชื่อภาพจากคลิปบอร์ดว่า "image.png" ทุกใบเหมือนกันหมด วางหลายใบแล้วแยกไม่ออก
    #    ต้องถูกตั้งชื่อใหม่ตามเวลาที่วาง (พี่ปอนด์ทักเอง 08/09/2026)
    # ตรวจ "รูปแบบ" ไม่ใช่ข้อความเป๊ะ ๆ — ชื่อนำหน้าปรับสั้นได้ตามที่เจ้าของสั่ง
    # ที่ต้องคงไว้จริง ๆ คือ ไม่ใช่ชื่อโหลอีกต่อไป + มีเวลาอยู่ในชื่อจึงไม่ซ้ำกัน
    import re as _re
    ck("หน้าแรก: เปลี่ยนชื่อโหล image.png เป็นชื่อที่มีเวลา (ไม่ซ้ำกัน)",
       home != "image.png" and bool(_re.search(r"\d{2}\.\d{2}\.\d{2}\.png$", home)), f" (ได้ {home!r})")
    ck("หน้าเครื่องมือ: วางแล้วไฟล์เข้าแถวจริง", bool(tool), f" (ได้ {tool!r})")
    ck("ไม่มี error ตอนวาง", not errs, f" ({errs[:1]})")

    print("\n━━ ①ข ไฟล์ที่มีชื่อจริง (ก๊อปจาก File Explorer) ต้องไม่ถูกเปลี่ยนชื่อ ━━")
    # ‼️ ต้อง reload จริง — hash route เดิมไม่ล้างไฟล์ที่ค้างจากเคสก่อน (SPA เก็บ state ไว้)
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(1200)
    pg.evaluate(PASTE_LIKE_WINDOWS.replace("'image.png'", "'รายงานประชุม.png'"), IMG); pg.wait_for_timeout(900)
    real = pg.eval_on_selector(".file-row .f-name", "e=>e.textContent") if pg.locator(".file-row .f-name").count() else ""
    ck("ชื่อไฟล์จริงต้องคงไว้ ไม่ไปตั้งใหม่ทับ", real == "รายงานประชุม.png", f" (ได้ {real!r})")

    print("\n━━ ② วางข้อความธรรมดา ต้องไม่ไปกวนหน้าเว็บ ━━")
    pg.goto(f"{BASE}/", wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.evaluate(PASTE_TEXT); pg.wait_for_timeout(500)
    ck("วางข้อความแล้วหน้าแรกต้องไม่เปลี่ยนเป็นมุมมองไฟล์", pg.locator(".drop-head").count() == 0)
    pg.close()

    print("\n━━ ③ พิสูจน์ว่าเทสแดงได้จริง: ถอดการอ่าน items ออก (= โค้ดเวอร์ชันที่มีบั๊ก) ━━")
    pg2 = b.new_page(viewport={"width": 1280, "height": 900})
    home_b, tool_b = run(pg2, broken=True)
    ck("[ฉีดบั๊ก] หน้าแรกต้องเงียบสนิท (แบบที่ผู้ใช้เจอ)", home_b == "", f" (ได้ {home_b!r})")
    ck("[ฉีดบั๊ก] หน้าเครื่องมือต้องเงียบสนิท", tool_b == "", f" (ได้ {tool_b!r})")
    pg2.close()
    b.close()

print("\n" + "━" * 58)
print(f"ผ่าน {passed} · ตก {len(failed)}")
sys.exit(1 if failed else 0)
