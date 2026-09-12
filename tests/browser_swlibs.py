"""deploy เวอร์ชันใหม่แล้ว ไลบรารีต้องไม่ถูกทิ้ง

‼️ ที่มา: พี่ปอนด์ทักเองว่า "ทำไมตอนเปลี่ยนภาษามันหมุนนานขึ้นมาก" (13/09/2026)
   ไล่จับแล้วพบว่า service worker เขียนแคชไลบรารีเป็น `${VERSION}-libs`
   ซึ่งผูกกับเวอร์ชันของแอป ทุกครั้งที่ deploy ตัว activate จะลบทิ้ง
   แล้วเบราว์เซอร์ต้องโหลด **ไลบรารีกับฟอนต์ 5.9 MB ใหม่ทั้งหมด**
   ทั้งที่ไฟล์พวกนี้ไม่ได้เปลี่ยนอะไรเลย (ชื่อไฟล์ตรึงรุ่นอยู่แล้ว)

   การเปลี่ยนภาษาคือการโหลดหน้าใหม่ (กติกาของ src/i18n.js ซึ่งถูกต้องแล้ว)
   ถ้าแคชเพิ่งโดนล้างเพราะ deploy ก็ต้องโหลดไลบรารีของเครื่องมือนั้นใหม่ทั้งก้อน
   วัดจริงบน pdf-pages เน็ต 600kbps ตัวหมุนหมุน 4,192 ms เทียบกับ 159 ms ตอนแคชอุ่น

เทสนี้จำลอง deploy จริง ๆ ด้วยการเปลี่ยนเวอร์ชันของ service worker
แล้วดูว่าแคชไลบรารียังอยู่ไหม

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_swlibs.py
‼️ ต้องรันกับเซิร์ฟเวอร์ในเครื่องเท่านั้น เพราะต้องแก้ไฟล์ sw.js ระหว่างเทส
"""
import os
import re
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW = os.path.join(ROOT, "sw.js")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

if not BASE.startswith("http://localhost"):
    print(f"ข้าม: เทสนี้ต้องแก้ไฟล์ sw.js ระหว่างรัน จึงรันกับเซิร์ฟเวอร์ในเครื่องเท่านั้น (ได้ {BASE})")
    sys.exit(0)

def sw_version():
    return re.search(r'const VERSION = "([^"]+)"', open(SW, encoding="utf-8").read()).group(1)

def set_sw_version(v):
    s = open(SW, encoding="utf-8").read()
    open(SW, "w", encoding="utf-8").write(re.sub(r'const VERSION = "[^"]+"', f'const VERSION = "{v}"', s, count=1))

orig = open(SW, encoding="utf-8").read()
start_v = sw_version()
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context()
        pg = ctx.new_page()

        print(f"\n① เปิดเครื่องมือที่ใช้ไลบรารีหนัก แล้วรอให้แคชติด (เวอร์ชัน {start_v})")
        # ‼️ service worker ติดตั้งตอนเปิดครั้งแรก แต่ยังไม่ "คุม" หน้านั้น
        #    ต้องโหลดใหม่อีกรอบก่อน คำขอถึงจะวิ่งผ่าน SW และไลบรารีถึงจะเข้าแคช
        #    (เขียนผิดครั้งแรกแล้วเทสแดงทั้งที่โค้ดถูก)
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_timeout(2500)
        pg.goto(BASE + "/#/pdf-pages", wait_until="networkidle")
        pg.wait_for_selector(".dz", timeout=20000)
        for _ in range(30):
            if pg.evaluate("async () => (await caches.keys()).some(k => k.includes('lib'))"):
                break
            pg.wait_for_timeout(400)
        keys = pg.evaluate("async () => (await caches.keys()).sort()")
        ck(f"มีแคชแยกสองก้อน คือเปลือกกับไลบรารี ({keys})", len(keys) >= 2, keys)
        libkey = [k for k in keys if "lib" in k]
        ck(f"ชื่อแคชไลบรารีไม่มีเวอร์ชันของแอปอยู่ในนั้น ({libkey})",
           len(libkey) == 1 and start_v not in libkey[0], libkey)

        # ‼️ ต้องเก็บ "รายชื่อไฟล์" ไม่ใช่แค่จำนวน
        #    เขียนเป็นจำนวนครั้งแรกแล้วเทสมีจุดบอด: ตอนฉีดบั๊กให้ลบแคชไลบรารีทิ้ง
        #    หน้าแรกที่เปิดต่อจากนั้นโหลดฟอนต์เข้าแคชใหม่ จำนวนจึงยังไม่เป็นศูนย์
        #    เทสเลยเขียวทั้งที่ pdf-lib หายไปจริง ๆ (พิสูจน์ด้วยการฉีดบั๊ก 13/09/2026)
        def lib_files():
            return set(pg.evaluate("""async () => {
                const k = (await caches.keys()).find(x => x.includes('lib'));
                if (!k) return [];
                return (await (await caches.open(k)).keys()).map(r => r.url.split('/').pop());
            }"""))
        before = lib_files()
        ck(f"แคชไลบรารีมีไฟล์อยู่จริง {len(before)} ไฟล์ ({sorted(before)})", len(before) >= 2, sorted(before))
        heavy = {f for f in before if f.endswith(".js")}
        ck(f"ในนั้นมีไลบรารีจริง ไม่ใช่มีแต่ฟอนต์ ({sorted(heavy)})", len(heavy) >= 1, sorted(before))

        print("\n② จำลอง deploy เวอร์ชันใหม่ แล้วเปิดเว็บอีกครั้ง")
        set_sw_version("filekit-TESTBUMP")
        pg.goto(BASE + "/?bump=1", wait_until="networkidle")
        pg.wait_for_timeout(1000)
        pg.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); }")
        # ‼️ ต้องรอจน activate เสร็จจริง ไม่ใช่แค่เห็นแคชใหม่โผล่
        #    ตัวจัดการ activate เป็นคนลบแคชเก่า ถ้าเช็คก่อนมันทำงานเสร็จจะเห็นของเก่าค้างอยู่
        for _ in range(60):
            ks = pg.evaluate("async () => await caches.keys()")
            if "filekit-TESTBUMP-shell" in ks and not any(k.startswith(start_v) for k in ks):
                break
            pg.wait_for_timeout(500)
        pg.goto(BASE + "/?bump=2", wait_until="networkidle")
        pg.wait_for_timeout(1500)
        keys2 = pg.evaluate("async () => (await caches.keys()).sort()")
        ck(f"เวอร์ชันใหม่ติดตั้งแล้วจริง ({keys2})", any("TESTBUMP" in k for k in keys2), keys2)
        ck(f"แคชเปลือกของเวอร์ชันเก่าถูกลบทิ้งตามที่ควร",
           not any(k.startswith(start_v) for k in keys2), keys2)

        print("\n③ ‼️ ข้อสำคัญที่สุด ไลบรารีต้องรอดจากการ deploy")
        after = lib_files()
        lost = before - after
        ck(f"ไฟล์ทุกตัวที่เคยแคชไว้ ยังอยู่ครบหลัง deploy (หายไป {len(lost)} ไฟล์)",
           not lost, f"หายไป {sorted(lost)} · ก่อน {sorted(before)} · หลัง {sorted(after)}")
        ck(f"ไลบรารีตัวหนัก ๆ ยังอยู่ ({sorted(heavy & after)})", heavy <= after, sorted(heavy - after))
        ck(f"ชื่อแคชไลบรารีไม่เปลี่ยนตามเวอร์ชันแอป ({[k for k in keys2 if 'lib' in k]})",
           any("lib" in k and "TESTBUMP" not in k for k in keys2), keys2)

        print("\n④ เปิดเครื่องมือเดิมหลัง deploy ต้องไม่โหลดไลบรารีจากเน็ตอีก")
        pg.goto(BASE + "/#/pdf-pages", wait_until="networkidle")
        pg.wait_for_selector(".dz", timeout=20000)
        pg.wait_for_timeout(2500)
        net = pg.evaluate("""() => performance.getEntriesByType('resource')
            .filter(r => r.name.includes('/vendor/') && r.transferSize > 1000)
            .map(r => r.name.split('/').pop())""")
        ck(f"ไม่มีไลบรารีตัวไหนถูกโหลดจากเน็ตซ้ำ (โหลดซ้ำ {len(net)} ไฟล์)", not net, net)
        br.close()
finally:
    open(SW, "w", encoding="utf-8").write(orig)
    print(f"\nคืนไฟล์ sw.js เป็น {sw_version()} แล้ว")

print(f"\nตก {len(fails)} ข้อ")
sys.exit(1 if fails else 0)
