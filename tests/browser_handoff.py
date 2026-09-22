# ส่งผังจาก FlowKit เข้าเครื่องมือของ FileKit (แผน FlowKit เฟส 3 ข้อ 5 , D5 , src/handoff.js)
#
# ‼️ ถามของที่ผู้ใช้ได้จริง: ไฟล์ที่ไปถึงเครื่องมือปลายทางเป็นไฟล์เดียวกับภาพบนจอ FlowKit ทุกไบต์ไหม
#    และของที่ฝากไว้ต้องหายทันทีหลังรับ (คนถัดไปที่ใช้เครื่องเดียวกันต้องไม่เจอไฟล์ของคนก่อน)
# ‼️ ของที่ค้างเกิน 5 นาทีต้องไม่ถูกรับ (ผู้ใช้กดส่งแล้วปิดแท็บไปทำอย่างอื่น กลับมาเปิดหน้าแรกทีหลัง)
# ‼️ หน้าแรกปกติ (ไม่มีของรอรับ) ต้องไม่โหลด handoff.js เลย งบ JS ของหน้าแรกตึงอยู่แล้ว
#
# --selftest ตัวตรวจต้องเห็นของค้างใน IndexedDB และเห็นไฟล์ผิดใบ

import sys, os, pathlib, traceback
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import preview_png

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
SELFTEST = "--selftest" in sys.argv
TARGETS = ["images-to-pdf", "image-resize", "image-convert"]

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


SHA = """async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const d = await crypto.subtle.digest('SHA-256', u); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }"""
CARRIED = """async () => { const m = await import('./src/ui.js'); const f = (m.carryFiles() || [])[0]; if (!f) return null;
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(await f.arrayBuffer()));
  return { name: f.name, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('') }; }"""
PENDING = """() => new Promise((r) => { const q = indexedDB.open('fk-handoff', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('box');
  q.onsuccess = () => { const g = q.result.transaction('box').objectStore('box').get('pending'); g.onsuccess = () => { r(g.result ? g.result.tool : null); q.result.close(); }; };
  q.onerror = () => r('เปิดไม่ได้'); })"""


def flow_ready(pg):
    pg.goto(BASE + "/flow/")
    pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready'", timeout=60000)


def main():
    import base64, hashlib
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        if SELFTEST:
            print("\n━━ selftest ━━")
            flow_ready(pg)
            pg.evaluate("""async () => { const h = await import('../src/handoff.js');
              await h.send([new File(['ไม่ใช่ภาพผัง'], 'ผิดใบ.txt')], 'images-to-pdf'); }""")
            ck("ตัวตรวจเห็นของที่ฝากค้างใน IndexedDB", pg.evaluate(PENDING) == "images-to-pdf")
            png = preview_png(pg)
            ck("ตัวเทียบไบต์เห็นว่าไฟล์คนละใบ", hashlib.sha256(png).hexdigest() != hashlib.sha256("ไม่ใช่ภาพผัง".encode()).hexdigest())
            b.close()
            return finish()

        print("\n━━ หน้าแรกปกติไม่โหลดตัวรับ ━━")
        seen = []
        pg.on("request", lambda r: seen.append(r.url))
        pg.goto(BASE + "/"); pg.wait_for_selector("#tools .pill", timeout=30000); pg.wait_for_timeout(800)
        ck("หน้าแรกที่ไม่มีของรอรับ ไม่โหลด handoff.js", not any(u.endswith("/src/handoff.js") for u in seen))

        for tool in TARGETS:
            print(f"\n━━ ส่งเข้า {tool} ━━")
            flow_ready(pg)
            sha = hashlib.sha256(preview_png(pg)).hexdigest()
            with pg.expect_navigation():
                pg.click(f"[data-send={tool}]")
            # ‼️ รอแบบวนถามเอง ไม่ใช้ wait_for_function กับฟังก์ชัน async: บนเว็บจริงหน้าเปลี่ยนระหว่างรอ
            #    ข้อผิดพลาดถูกกลืนแล้วไปอ่านก่อนเครื่องมือโหลดเสร็จ ได้ None ทั้งที่ไฟล์ไปถึงจริง (จับได้ 22/09/2026)
            pg.wait_for_load_state("load")
            got = None
            for _ in range(40):
                try:
                    got = pg.evaluate(CARRIED)
                except Exception:
                    got = None
                if got: break
                pg.wait_for_timeout(500)
            ck(f"[{tool}] กดแล้วไปที่เครื่องมือนั้น แท็บเดิม", pg.url.endswith("#/" + tool), pg.url)
            ck(f"[{tool}] ไฟล์ไปถึงกล่องรับของเครื่องมือเลย ไม่ต้องเลือกไฟล์ใหม่ ตรงกับภาพบนจอทุกไบต์",
               bool(got) and got["sha"] == sha and got["name"].endswith(".drawio.png"), str(got and got["name"]))
            ck(f"[{tool}] รับแล้วของที่ฝากถูกลบทันที ทั้งใน IndexedDB และธง", pg.evaluate(PENDING) is None
               and pg.evaluate("() => sessionStorage.getItem('fk:handoff')") is None)

        print("\n━━ ของค้างเกิน 5 นาที ━━")
        flow_ready(pg)
        pg.evaluate("""async () => { const h = await import('../src/handoff.js');
          await h.send([new File([new Uint8Array([137, 80, 78, 71])], 'เก่า.png', { type: 'image/png' })], 'image-resize');
          const q = indexedDB.open('fk-handoff', 1);
          await new Promise((r) => { q.onsuccess = () => { const s = q.result.transaction('box', 'readwrite').objectStore('box');
            const g = s.get('pending'); g.onsuccess = () => { const v = g.result; v.at = Date.now() - 6 * 60 * 1000; s.put(v, 'pending').onsuccess = () => { q.result.close(); r(); }; }; }; }); }""")
        pg.goto(BASE + "/#/image-resize"); pg.wait_for_timeout(2500)
        stale = pg.evaluate(CARRIED)
        ck("ของที่ฝากไว้เกิน 5 นาทีไม่ถูกรับ กล่องรับว่าง", stale is None, str(stale))
        ck("ของเก่าที่หมดอายุก็ถูกลบทิ้งด้วย", pg.evaluate(PENDING) is None)

        ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
        b.close()
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจเห็นของค้างและไฟล์ผิดใบ" if SELFTEST else "✅ ส่งผังเข้า FileKit ได้ครบ ไฟล์ตรงทุกไบต์ ไม่มีของค้าง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
