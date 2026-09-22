# หน้าเว็บหลายหน้าใต้ service worker ตัวเดียว ต้องไม่ปนกัน (หน้าแรก FileKit กับ flow/ ของ FlowKit)
#
# ‼️ บั๊กที่เทสนี้จับ (เจอ 22/09/2026 ตอนอ่าน sw.js ก่อนเพิ่มหน้า flow/)
#    ตัวจัดการ "เปิดหน้า" (navigate) ใน sw.js ตอบทุกหน้าด้วยแคชของ index.html หน้าแรก
#    และเอาหน้าไหนก็ตามที่โหลดจากเน็ตไปเขียนทับกุญแจ index.html
#    ผล ① เปิด /flow/ ตอนเน็ตช้าเกิน 1.2 วินาที ได้หน้าแรกของ FileKit แทน
#       ② เปิด /flow/ ตอนเน็ตเร็ว แคชของหน้าแรกกลายเป็นหน้า FlowKit เปิดหน้าแรกครั้งถัดไปตอนเน็ตช้าหรือออฟไลน์ ได้ FlowKit
# ‼️ ต้องใช้เซิร์ฟเวอร์ของเทสเอง เพราะต้องหน่วงเวลาตอบเฉพาะหน้าได้ (ตัวดักคำขอของ Playwright ไม่เห็นคำขอที่ service worker ยิงเอง)
#
# --selftest ตัวตรวจต้องแยกหน้าสองหน้าออกจากกันได้จริง (ป้อนหน้าผิดใบให้แล้วต้องจับได้)

import sys, os, time, threading, functools, http.server, socketserver, pathlib, traceback
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SELFTEST = "--selftest" in sys.argv
DELAY = {"on": False}

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")     # ให้ทุกครั้งผ่าน service worker จริง ไม่ใช่แคชของเบราว์เซอร์
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if DELAY["on"] and (path in ("/", "/index.html", "/flow/", "/flow/index.html")):
            time.sleep(2.5)                                 # ช้ากว่าเพดาน 1.2 วินาทีของ sw.js
        return super().do_GET()


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def which(pg):
    """หน้านี้คือหน้าไหนจริง ๆ ดูจากของในหน้า ไม่ใช่จาก URL"""
    return pg.evaluate("""() => document.querySelector('main.flow') ? 'flowkit'
        : document.querySelector('#tools') ? 'filekit' : 'อื่น ' + document.title""")


def main():
    srv = Server(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context()
            pg = ctx.new_page()
            pg.goto(base + "/")
            # service worker ติดตั้งแล้วคุมหน้า (หน้าแรกลงทะเบียนตอน load)
            pg.wait_for_function("async () => !!(await navigator.serviceWorker.getRegistration())?.active", timeout=20000)
            pg.reload(); pg.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=15000)
            ck("service worker คุมหน้าแล้ว", pg.evaluate("() => !!navigator.serviceWorker.controller"))

            if SELFTEST:
                ck("ตัวตรวจรู้ว่าหน้าแรกคือ FileKit", which(pg) == "filekit", which(pg))
                pg.goto(base + "/flow/")
                ck("ตัวตรวจรู้ว่าหน้า flow/ คือ FlowKit", which(pg) == "flowkit", which(pg))
                b.close()
                return finish()

            print("\n━━ เน็ตเร็ว ━━")
            pg.goto(base + "/flow/")
            ck("เปิด /flow/ ได้ FlowKit", which(pg) == "flowkit", which(pg))
            pg.goto(base + "/")
            ck("กลับหน้าแรกได้ FileKit", which(pg) == "filekit", which(pg))

            print("\n━━ เน็ตช้าเกินเพดาน 1.2 วินาที (service worker หยิบแคชแทน) ━━")
            DELAY["on"] = True
            pg.goto(base + "/flow/", timeout=30000)
            ck("‼️ เปิด /flow/ ตอนเน็ตช้า ยังได้ FlowKit ไม่ใช่หน้าแรกของ FileKit", which(pg) == "flowkit", which(pg))
            DELAY["on"] = False
            pg.wait_for_timeout(3000)                         # ให้คำขอช้าที่ค้างอยู่จบก่อน จะได้ไม่ปนกับรอบถัดไป
            pg.goto(base + "/flow/")                          # หน้าสุดท้ายที่โหลดจากเน็ตคือ FlowKit
            DELAY["on"] = True
            pg.goto(base + "/", timeout=30000)
            ck("‼️ เปิด FlowKit แล้วกลับหน้าแรกตอนเน็ตช้า ยังได้ FileKit (แคชหน้าแรกไม่ถูก FlowKit เขียนทับ)", which(pg) == "filekit", which(pg))
            DELAY["on"] = False
            pg.wait_for_timeout(3000)

            print("\n━━ ออฟไลน์ ━━")
            pg.goto(base + "/flow/"); pg.goto(base + "/")        # ให้ทั้งสองหน้าอยู่ในแคชรอบล่าสุด
            ctx.set_offline(True)
            pg.goto(base + "/")
            ck("ออฟไลน์ เปิดหน้าแรกได้ FileKit", which(pg) == "filekit", which(pg))
            try:
                pg.goto(base + "/flow/"); got = which(pg)
            except Exception as e:
                got = f"เปิดไม่ได้ {str(e)[:60]}"
            ck("ออฟไลน์ เปิด /flow/ ได้ FlowKit", got == "flowkit", got)
            # ‼️ วัดจริง 22/09/2026: เคยเปิด FlowKit ตอนออนไลน์แล้ว draw.io อยู่ในแคชของเบราว์เซอร์ ปิดเน็ตก็ยังวาดได้
            #    ข้อที่ห้ามพลาดคือ "ค้างเงียบ" จึงยอมทั้งวาดได้ และบอกว่าต้องต่อเน็ต (ถ้าวันหนึ่ง diagrams.net เลิกให้แคช)
            end_state = ""
            if got == "flowkit":
                try:
                    pg.wait_for_function("""() => { const c = document.querySelector('#canvas');
                        return c.dataset.state === 'ready' || (c.dataset.state === 'error' && /อินเทอร์เน็ต/.test(c.textContent)); }""", timeout=20000)
                    end_state = pg.evaluate("() => document.querySelector('#canvas').dataset.state")
                except Exception:
                    end_state = f"ค้าง {pg.evaluate('() => document.querySelector(\"#canvas\").dataset.state')} {pg.inner_text('#cvmsg')!r}"
            ck(f"ออฟไลน์หลังเคยเปิดแล้ว ไม่ค้างเงียบ ได้ผลภายใน 20 วินาที (ครั้งนี้ {end_state or '-'})", end_state in ("ready", "error"), end_state)
            ctx.set_offline(False)

            print("\n━━ ออฟไลน์ ตอนที่ draw.io ยังไม่เคยโหลดเข้าเครื่อง ━━")
            c2 = b.new_context()
            c2.route("https://embed.diagrams.net/**", lambda r: r.abort())    # ตอนออนไลน์ก็โหลด draw.io ไม่ได้ จึงไม่มีในแคช
            p2 = c2.new_page(); p2.goto(base + "/")
            p2.wait_for_function("async () => !!(await navigator.serviceWorker.getRegistration())?.active", timeout=20000)
            p2.reload(); p2.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=15000)
            p2.goto(base + "/flow/"); p2.wait_for_timeout(1500)
            c2.set_offline(True)
            p2.goto(base + "/flow/")
            try:
                p2.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'error'", timeout=5000); msg = p2.inner_text("#cvmsg")
            except Exception:
                msg = ""
            ck("ออฟไลน์และไม่มี draw.io ในเครื่อง บอกทันทีว่าไม่ได้ต่ออินเทอร์เน็ต (ไม่เกิน 5 วินาที)", "อินเทอร์เน็ต" in msg, repr(msg))
            ck("มีปุ่มลองใหม่ และปุ่มดาวน์โหลดกดไม่ได้", p2.locator("#cvmsg button").count() == 1 and not p2.is_enabled("#dl"))
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
    print("✅ ตัวตรวจแยกหน้าได้" if SELFTEST else "✅ หน้าแรกกับ FlowKit ไม่ปนกันในแคช ทั้งเน็ตเร็ว เน็ตช้า และออฟไลน์")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
