"""โค้ดที่เอาไปใช้ต่อ ต้องอ่านง่ายและคัดลอกได้สะอาด

‼️ ที่มา พี่ปอนด์วางคีย์ของสามเสา Power BI, Power Query, Power Automate ไว้ว่า
   "ทำให้เราได้ Code ไปใช้งานแบบ Dynamic แล้วยังคงประสิทธิภาพสูงสุด"
   v75 ทำกล่องโค้ดพร้อมไฮไลต์สีให้กราฟ Deneb ไปแล้ว แต่เครื่องมือสายโค้ดอีก 4 ตัว
   ยังเป็นตัวหนังสือสีเดียวล้วน ทั้งที่ตัวทาสีเขียนไว้แล้วและพิสูจน์แล้ว

‼️ จุดเสี่ยงที่สุดของการทาสี คือปุ่มคัดลอกอ่านจาก textContent
   ถ้าทาสีแล้ว textContent เปลี่ยนไปแม้แต่ตัวเดียว = ผู้ใช้เอาโค้ดเสียไปวางใน flow จริง
   เทสนี้จึงเทียบ "สิ่งที่คัดลอกได้" กับ "สิ่งที่ตาเห็น" ทุกครั้ง ไม่ใช่แค่ดูว่ามีสี

เทสนี้ตรวจ 4 อย่าง
   ① ทุกกล่องโค้ดมีการทาสีจริง (นับ token ได้มากกว่า 0)
   ② ‼️ markup ของตัวทาสีต้องไม่หลุดมาเป็นตัวหนังสือให้ผู้ใช้เห็น
   ③ ‼️ ปุ่มคัดลอกต้องได้ข้อความเท่ากับที่ตาเห็นเป๊ะ ไม่มีแท็ก HTML ปน
   ④ ประชากรต้องไม่เป็นศูนย์ (ตรวจได้ครบทุกกล่องที่ประกาศไว้)

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_codepaint.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []
# เศษ markup ที่จะโผล่มาเป็นตัวหนังสือถ้าตัวทาสีไปทาทับของตัวเอง
LEAK = ('class=<i', 'cv-cmt">', 'cv-str">', 'cv-kw">', 'cv-key">', 'cv-num">', 'cv-lit">')
MIN_VIEWS = 5     # จำนวนกล่องโค้ดที่ต้องตรวจได้อย่างน้อย

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

def go(pg, route):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{route}", wait_until="networkidle")
    pg.wait_for_timeout(900)

def contrast(fg, bg):
    """คอนทราสต์ตามสูตร WCAG จากสตริง rgb() ที่เบราว์เซอร์คืนมา"""
    def lum(c):
        v = [int(x) / 255 for x in c[c.index("(") + 1:c.index(")")].split(",")[:3]]
        f = lambda u: u / 12.92 if u <= .03928 else ((u + .055) / 1.055) ** 2.4
        return .2126 * f(v[0]) + .7152 * f(v[1]) + .0722 * f(v[2])
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + .05) / (lo + .05)

def read(pg, sel):
    return pg.evaluate("""(sel) => {
        const e = document.querySelector(sel);
        if (!e || !e.offsetParent) return null;
        return {colored: e.querySelectorAll('i[class^=cv-]').length, txt: e.textContent};
    }""", sel)

def probe(pg, label, sel):
    """ตรวจกล่องโค้ดหนึ่งกล่อง แล้วคืน True ถ้าตรวจได้จริง"""
    r = read(pg, sel)
    if r is None:
        ck(f"{label} — หากล่องโค้ดเจอ", False, f"selector {sel} ไม่โผล่")
        return False
    ck(f"① {label} ทาสีจริง ({r['colored']} โทเคน, {len(r['txt'])} ตัวอักษร)", r["colored"] > 0)
    leaked = [x for x in LEAK if x in r["txt"]]
    ck(f"② {label} ไม่มี markup หลุดมาเป็นตัวหนังสือ", not leaked, f"พบ {leaked}")
    btn = pg.evaluate("""() => {
        const b = [...document.querySelectorAll('button')]
            .find(e => e.offsetParent && /คัดลอก|Copy/i.test(e.textContent));
        if (!b) return null; b.click(); return b.textContent.trim();
    }""")
    if btn:
        pg.wait_for_timeout(600)
        clip = pg.evaluate("() => navigator.clipboard.readText()")
        ck(f"③ {label} คัดลอกแล้วได้ข้อความเท่าที่ตาเห็นเป๊ะ ({len(clip)} ตัวอักษร)",
           clip == r["txt"] and "<i" not in clip,
           f"ยาว {len(clip)} เทียบ {len(r['txt'])}, มีแท็ก={'<i' in clip}")
    return True

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 950},
                         permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    done = 0

    # ── สองตัวที่ป้อนด้วยไฟล์ ─────────────────────────────────────────────
    for tool, sel, label in [("excel-to-pq", ".pq-code", "Power Query M จาก Excel"),
                             ("pa-parse-json", ".paj-code", "Schema ของ Parse JSON")]:
        go(pg, tool)
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
        pg.wait_for_timeout(3800)
        done += probe(pg, label, sel)

    # ── ตัวที่ป้อนเอง มีโค้ดตั้งต้นให้อยู่แล้ว ────────────────────────────
    go(pg, "pq-multisource-lookup")
    pg.wait_for_timeout(1600)
    done += probe(pg, "สูตรค้นข้ามหลายแหล่ง (M)", ".pqm-code")

    # ── ตาราง HTML มีสองแท็บโค้ด ต้องถูกทั้งคู่ ──────────────────────────
    go(pg, "pa-html-table")
    pg.wait_for_timeout(1600)
    tabs = pg.evaluate("() => [...document.querySelectorAll('.pah-tabs button')].map(e => e.textContent.trim())")
    ck("หาแท็บของตาราง HTML เจอ", len(tabs) >= 2, f"เจอ {tabs}")
    for i, name in enumerate(tabs):
        if "พรีวิว" in name:
            continue                      # แท็บพรีวิวเป็นตารางจริง ไม่ใช่กล่องโค้ด
        pg.evaluate("(i) => document.querySelectorAll('.pah-tabs button')[i].click()", i)
        pg.wait_for_timeout(1100)
        done += probe(pg, f"ตาราง HTML แท็บ {name}", ".pah-code")

    # ‼️ กันกับดักประชากรศูนย์ — ถ้า selector เปลี่ยนหมด ลูปข้างบนจะไม่ตรวจอะไรเลยแล้วเขียวหลอก
    # ⑤ ‼️ สีที่ทาต้องอ่านออกจริงทั้งสองโหมด ไม่ใช่แค่ "มีสี"
    #    ค่าของ v75 ตกเกณฑ์ 2 ตัวโดยไม่มีใครรู้ เพราะไม่เคยมีใครวัด
    #    เก็บจาก 2 หน้ารวมกัน เพราะหน้าเดียวมีโทเคนไม่ครบทุกชนิด
    #    (schema JSON มีแต่คีย์กับสตริง ส่วนสูตร M มีคำสงวนกับคอมเมนต์)
    GRAB = """() => {
        const box = document.querySelector(SEL);
        if (!box) return null;
        const bg = getComputedStyle(box).backgroundColor;
        const seen = {};
        box.querySelectorAll('i[class^=cv-]').forEach(i => { seen[i.className] = getComputedStyle(i).color; });
        return {bg, seen};
    }"""
    for mode in ("light", "dark"):
        mc = br.new_context(viewport={"width": 1440, "height": 950}, color_scheme=mode)
        mp = mc.new_page()
        colors = {}
        bg = None
        for tool, sel, needs_file in [("pa-parse-json", ".paj-code", True),
                                      ("pq-multisource-lookup", ".pqm-code", False)]:
            mp.goto("about:blank")
            mp.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
            mp.wait_for_timeout(900)
            if needs_file:
                mp.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
                mp.wait_for_timeout(3600)
            else:
                mp.wait_for_timeout(1400)
            got = mp.evaluate(GRAB.replace("SEL", repr(sel)))
            if got:
                colors.update(got["seen"])
                bg = got["bg"]
        worst, worst_k = 99, ""
        for k, v in colors.items():
            r = contrast(v, bg)
            if r < worst: worst, worst_k = r, k
        ck(f"⑤ โหมด{'สว่าง' if mode == 'light' else 'มืด'} สีโค้ดอ่านออกทุกตัว "
           f"({len(colors)} ชนิด แย่สุด {worst_k} = {worst:.2f}:1)",
           len(colors) >= 3 and worst >= 4.5,
           f"วัดได้ {len(colors)} ชนิด, แย่สุด {worst:.2f}")
        mc.close()

    ck(f"④ ตรวจกล่องโค้ดได้ {done} กล่อง (ต้อง >= {MIN_VIEWS})", done >= MIN_VIEWS)
    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
