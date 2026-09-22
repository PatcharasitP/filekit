# หน้าเว็บหลายหน้าใต้ service worker ตัวเดียว ต้องไม่ปนกัน (หน้าแรก FileKit กับหน้าส่งต่อ flow/)
#
# ‼️ บั๊กเดิมที่เทสนี้จับ (เจอ 22/09/2026 ตอนอ่าน sw.js ก่อนเพิ่มหน้า flow/)
#    ตัวจัดการ "เปิดหน้า" ใน sw.js เคยตอบทุกหน้าด้วยแคชของ index.html หน้าแรก และเอาหน้าไหนก็ตามที่โหลดจากเน็ตไปเขียนทับกุญแจนั้น
#    ผล เปิด /flow/ ตอนเน็ตช้าได้หน้าแรกแทน , หรือหน้าแรกกลายเป็นหน้าอื่นตอนเน็ตช้าหรือออฟไลน์
# ‼️ 22/09/2026 FlowKit ย้ายไปเป็นเว็บของตัวเองที่ /flowkit/ (แผนเว็บ FlowKit แยก ข้อ 7)
#    flow/ ของ FileKit เหลือเป็นหน้าส่งต่อ เทสนี้จึงถามว่า ใต้ service worker ของ FileKit ลิงก์เดิมยังพาไปหน้าวาดใหม่ถูกทุกสภาพเน็ต
#    และตอนออฟไลน์เห็นข้อความว่าย้ายบ้าน ไม่ใช่หน้าแรกของ FileKit และไม่ใช่หน้าเน็ตหลุด
# ‼️ เซิร์ฟเวอร์ของเทสเอง mount สองเว็บเหมือนเว็บจริง (/filekit/ กับ /flowkit/) service worker จึงมีขอบเขตแค่ /filekit/ แบบของจริง
#    และหน่วงเวลาตอบเฉพาะหน้าได้ (ตัวดักคำขอของ Playwright ไม่เห็นคำขอที่ service worker ยิงเอง)
#    ‼️ ต้องมีโฟลเดอร์ FlowKit ข้าง ๆ (หรือ FLOWKIT_DIR) ไม่เจอ = แดง ไม่ข้ามเงียบ
#
# --selftest ตัวตรวจต้องแยกหน้าสามแบบออกจากกันได้จริง (หน้าแรก FileKit , หน้าส่งต่อ , หน้าวาด FlowKit)

import sys, os, time, threading, functools, http.server, socketserver, pathlib, traceback, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
FLOWKIT = pathlib.Path(os.environ.get("FLOWKIT_DIR", ROOT.parent / "FlowKit"))
SELFTEST = "--selftest" in sys.argv
DELAY = {"on": False}
SLOW = ("/filekit/", "/filekit/index.html", "/filekit/flow/", "/filekit/flow/index.html")

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        for pre, d in (("/filekit/", ROOT), ("/flowkit/", FLOWKIT)):
            if p.startswith(pre) and ".." not in p:
                return str(d / p[len(pre):])
        return str(ROOT / "__ไม่มี__")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")     # ให้ทุกครั้งผ่าน service worker จริง ไม่ใช่แคชของเบราว์เซอร์
        super().end_headers()

    def do_GET(self):
        if DELAY["on"] and self.path.split("?")[0] in SLOW:
            time.sleep(2.5)                                 # ช้ากว่าเพดาน 1.2 วินาทีของ sw.js
        return super().do_GET()


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def which(pg):
    """หน้านี้คือหน้าไหนจริง ๆ ดูจากของในหน้า ไม่ใช่จาก URL"""
    return pg.evaluate("""() => document.title === 'FlowKit ย้ายบ้านแล้ว' ? 'ย้ายบ้าน'
        : document.querySelector('main.flow') ? 'หน้าวาด FlowKit'
        : document.querySelector('#tools') ? 'filekit' : 'อื่น ' + document.title""")


def ready_sw(pg, base):
    pg.goto(base + "/filekit/")
    pg.wait_for_function("async () => !!(await navigator.serviceWorker.getRegistration())?.active", timeout=20000)
    pg.reload(); pg.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=15000)


def landed(pg):
    """รอให้หน้าส่งต่อพาไปจบ (หรือค้างที่หน้าย้ายบ้านตอนออฟไลน์) แล้วบอกว่าได้หน้าไหน"""
    try:
        pg.wait_for_function("() => document.title === 'FlowKit ย้ายบ้านแล้ว' || !!document.querySelector('main.flow')", timeout=20000)
        pg.wait_for_timeout(300)
    except Exception:
        pass
    return which(pg)


def main():
    if not (FLOWKIT / "draw" / "index.html").exists():
        ck(f"เจอโฟลเดอร์ FlowKit ที่ {FLOWKIT} (clone repo flowkit ไว้ข้าง ๆ หรือตั้ง FLOWKIT_DIR)", False)
        return finish()
    srv = Server(("127.0.0.1", 0), Handler)
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context()
            pg = ctx.new_page()
            ready_sw(pg, base)
            ck("service worker คุมหน้าแรกแล้ว ขอบเขต /filekit/ แบบเว็บจริง",
               pg.evaluate("async () => (await navigator.serviceWorker.getRegistration()).scope") == base + "/filekit/")

            if SELFTEST:
                ck("ตัวตรวจรู้ว่าหน้าแรกคือ FileKit", which(pg) == "filekit", which(pg))
                pg.goto(base + "/flowkit/draw/"); pg.wait_for_selector("main.flow")
                ck("ตัวตรวจรู้ว่าหน้าวาดคือ FlowKit", which(pg) == "หน้าวาด FlowKit", which(pg))
                # ‼️ หน้าส่งต่อพาไปเองทั้งตอนมี JS และปิด JS (noscript meta refresh) จึงเสิร์ฟสำเนาที่ถอดตัวพาไปออก แล้วถามตัวตรวจ
                import re
                raw = (ROOT / "flow" / "index.html").read_text(encoding="utf-8")
                still = re.sub(r"<noscript>[\s\S]*?</noscript>", "", re.sub(r"<script>[\s\S]*?</script>", "", raw))
                pg.route(base + "/filekit/__moved_selftest.html", lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=still))
                pg.goto(base + "/filekit/__moved_selftest.html")
                ck("ตัวตรวจรู้ว่าหน้าส่งต่อคือหน้าย้ายบ้าน", which(pg) == "ย้ายบ้าน", which(pg))
                b.close()
                return finish()

            print("\n━━ เน็ตเร็ว ━━")
            navs = []
            pg.on("request", lambda r: navs.append(r.url.replace(base, "")) if r.is_navigation_request() and r.frame == pg.main_frame else None)
            pg.goto(base + "/filekit/flow/?kind=org#x")
            got = landed(pg)
            ck("ลิงก์เดิม /filekit/flow/ พาไปหน้าวาด FlowKit", got == "หน้าวาด FlowKit", got)
            ck("ส่งต่อพร้อม ? (คำขอไป /flowkit/draw/?kind=org)", "/flowkit/draw/?kind=org" in navs, str(navs[-3:]))
            ck("ส่งต่อพร้อม # และหน้าวาดใช้พารามิเตอร์จริง (เปิดผังองค์กร)",
               pg.url.endswith("#x") and pg.evaluate("() => document.querySelector('#types .type[data-kind=\"org\"]')?.getAttribute('aria-pressed')") == "true", pg.url)
            pg.goto(base + "/filekit/")
            ck("กลับหน้าแรกได้ FileKit", which(pg) == "filekit", which(pg))

            print("\n━━ เน็ตช้าเกินเพดาน 1.2 วินาที (service worker หยิบแคชแทน) ━━")
            DELAY["on"] = True
            pg.goto(base + "/filekit/flow/", timeout=30000)
            got = landed(pg)
            ck("‼️ เปิดลิงก์เดิมตอนเน็ตช้า ยังไปหน้าวาด FlowKit ไม่ใช่หน้าแรกของ FileKit", got == "หน้าวาด FlowKit", got)
            DELAY["on"] = False
            pg.wait_for_timeout(3000)                         # ให้คำขอช้าที่ค้างอยู่จบก่อน จะได้ไม่ปนกับรอบถัดไป
            pg.goto(base + "/filekit/flow/"); landed(pg)      # หน้าสุดท้ายที่ FileKit โหลดจากเน็ตคือหน้าส่งต่อ
            DELAY["on"] = True
            pg.goto(base + "/filekit/", timeout=30000)
            ck("‼️ เปิดลิงก์เดิมแล้วกลับหน้าแรกตอนเน็ตช้า ยังได้ FileKit (แคชหน้าแรกไม่ถูกหน้าส่งต่อเขียนทับ)", which(pg) == "filekit", which(pg))
            DELAY["on"] = False
            pg.wait_for_timeout(3000)

            print("\n━━ ออฟไลน์ ━━")
            pg.goto(base + "/filekit/")
            ctx.set_offline(True)
            pg.goto(base + "/filekit/")
            ck("ออฟไลน์ เปิดหน้าแรกได้ FileKit", which(pg) == "filekit", which(pg))
            try:
                pg.goto(base + "/filekit/flow/"); got = landed(pg)
            except Exception as e:
                got = f"เปิดไม่ได้ {str(e)[:60]}"
            ck("ออฟไลน์ เปิดลิงก์เดิมได้หน้าย้ายบ้าน (ไม่ใช่หน้าเน็ตหลุด ไม่ใช่หน้าแรก)", got == "ย้ายบ้าน", got)
            ck("หน้าย้ายบ้านมีลิงก์ไปที่ใหม่", pg.locator('a[href="/flowkit/draw/"]').count() >= 1 if got == "ย้ายบ้าน" else False)
            ctx.set_offline(False)

            print("\n━━ ออฟไลน์ ตอนที่ยังไม่เคยเปิดลิงก์เดิมเลย (หน้าส่งต่ออยู่ใน PRECACHE) ━━")
            c2 = b.new_context(); p2 = c2.new_page(); ready_sw(p2, base)
            p2.wait_for_timeout(1500)                         # ให้ PRECACHE ลงครบ
            c2.set_offline(True)
            try:
                p2.goto(base + "/filekit/flow/"); got = landed(p2)
            except Exception as e:
                got = f"เปิดไม่ได้ {str(e)[:60]}"
            ck("ไม่เคยเปิดมาก่อน ออฟไลน์ก็ยังได้หน้าย้ายบ้าน", got == "ย้ายบ้าน", got)
            c2.close()
            b.close()
    finally:
        srv.shutdown()
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจแยกหน้าได้" if SELFTEST else "✅ หน้าแรกกับหน้าส่งต่อไม่ปนกันในแคช ลิงก์เดิมพาไป FlowKit ทุกสภาพเน็ต")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
