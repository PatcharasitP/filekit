"""แถบ "ลองแล้วได้แบบนี้" ต้องตรงกับความจริงเสมอ

‼️ ที่มา พี่ปอนด์สั่งให้เอาแนวคิด Examples ของ thepexcel มาใช้ คือให้เห็นว่าใส่อะไรเข้าไป
   ได้อะไรออกมา ก่อนลงมือทำ

‼️ ทำไมเทสนี้สำคัญกว่าเทสหน้าตาทั่วไป
   ตัวเลขในแถบนี้เป็น "คำสัญญา" กับผู้ใช้ว่าเครื่องมือทำอะไรให้ ถ้าโค้ดเปลี่ยนแล้ว
   ผลลัพธ์จริงเปลี่ยนตาม แต่ตัวเลขที่โชว์ไม่เปลี่ยน มันจะกลายเป็นคำโกหกที่ไม่มีใครรู้
   เทสนี้จึง "รันเครื่องมือจริง" แล้วเทียบกับตัวเลขที่ประกาศไว้ใน src/toolio.js
   ไม่ใช่แค่ดูว่ามีแถบโผล่มาไหม

   ตอนเก็บข้อมูลครั้งแรก ลองดึงจากซอร์สด้วย regex ได้แค่ 18 จาก 41 ตัว และผิดด้วย
   (pbi-bar ขึ้นเป็น csv ทั้งที่จริงได้สเปก Deneb) จึงเปลี่ยนมาวัดจากการรันจริงทั้งหมด

เทสนี้ตรวจ 4 อย่าง
   ① ทุกเครื่องมือที่ประกาศไว้ ต้องแสดงแถบจริงบนหน้า
   ② เครื่องมือที่ไม่ได้ประกาศ ต้องไม่แสดงอะไร (ห้ามเดา)
   ③ ‼️ รันจริงแล้วผลต้องตรงกับที่ประกาศ (สุ่มตรวจหลายตัว)
   ④ ตัวหนังสือในแถบต้องอ่านออกทั้งโหมดสว่างและมืด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_toolio.py
"""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = Path(__file__).resolve().parent.parent
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

src = (ROOT / "src/toolio.js").read_text(encoding="utf-8")
# ‼️ ไฟล์เก็บทั้งสองภาษา เทสนี้รันโหมดไทยจึงเทียบกับชุดไทย
ALL_IO = json.loads(src[src.index("{"):src.rindex(";\n\nimport")])
IO = {k: v["th"] for k, v in ALL_IO.items()}
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
ALL = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]

# ‼️ กันกับดักประชากรศูนย์
ck(f"อ่านข้อมูลที่วัดไว้ได้ {len(IO)} เครื่องมือ จากทะเบียน {len(ALL)} ตัว",
   len(IO) >= 15 and len(ALL) >= 30, f"IO={len(IO)} ALL={len(ALL)}")

# ③ ‼️ ตรวจ "ทุกตัว" ที่ประกาศไว้ ไม่ใช่สุ่ม
#    เหตุผล: ลองสุ่มแค่ 5 ตัวก่อน แล้วพิสูจน์ด้วยการใส่ข้อมูลปลอมของเครื่องมือที่ไม่เคยวัด
#    ปรากฏว่าเทสไม่แดง เพราะตัวปลอมไม่ได้อยู่ในกลุ่มที่สุ่ม
#    ข้อมูลชุดนี้คือคำสัญญากับผู้ใช้ว่าเครื่องมือทำอะไรให้ จึงต้องตรวจครบทุกบรรทัด
#    ช้าหน่อย (ราว 5 นาที) แต่เป็นราคาที่ถูกต้องสำหรับของที่ห้ามโกหก
VERIFY = list(IO)

def lum(c):
    v = [float(x) for x in re.findall(r"[\d.]+", c)[:3]]
    if not c.startswith("color("):
        v = [x / 255 for x in v]
    f = lambda u: u / 12.92 if u <= .03928 else ((u + .055) / 1.055) ** 2.4
    return .2126 * f(v[0]) + .7152 * f(v[1]) + .0722 * f(v[2])

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + .05) / (lo + .05)

def size_close(got, want):
    """เทียบขนาดไฟล์แบบเผื่อการแกว่งเล็กน้อย

    ‼️ ที่มา 20/09/2026 ชุดเทสเต็มตกที่ pdf-to-word ประกาศ 8.4 KB แต่ได้จริง 8.3 KB
    วัดซ้ำ 5 รอบได้ 8.4, 8.4, 8.4, 8.4, 8.3 คือแกว่งจริง ไม่ใช่ของพัง
    ต้นเหตุคือไลบรารี docx ใช้ Packer สร้างไฟล์ zip ซึ่งฝังเวลาปัจจุบัน
    ลงในหัวรายการ zip ทุกครั้ง ขนาดหลังบีบอัดจึงต่างกันได้ไม่กี่ไบต์ทุกรอบ
    เป็นพฤติกรรมของไลบรารี แก้ที่ฝั่งเราไม่ได้ถ้าไม่ไปรื้อ zip ใหม่ ซึ่งไม่คุ้ม

    ‼️ ยังเทียบหน่วยแบบตรงตัวเสมอ KB กับ MB ต่างกันคือของพังจริง ต้องแดง
    ‼️ เผื่อแค่ 0.2 หน่วยหรือ 3% แล้วแต่ตัวไหนมากกว่า ซึ่งพอสำหรับการปัดเศษ
    แต่ไม่พอจะกลบการถดถอยจริง (เช่น 8.4 เป็น 12 KB ยังแดงอยู่)
    """
    import re
    g = re.match(r"([\d.,]+)\s*(\w+)", (got or "").strip())
    w = re.match(r"([\d.,]+)\s*(\w+)", (want or "").strip())
    if not g or not w:
        return (got or "").strip() == (want or "").strip()
    if g.group(2) != w.group(2):
        return False
    gv = float(g.group(1).replace(",", ""))
    wv = float(w.group(1).replace(",", ""))
    return abs(gv - wv) <= max(0.2, wv * 0.03)


with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    shown, missing = 0, []
    for tid in list(IO)[:8]:
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_timeout(900)
        txt = pg.evaluate("() => { const e = document.querySelector('.tex'); return e ? e.innerText : ''; }")
        if txt.strip(): shown += 1
        else: missing.append(tid)
    ck(f"① เครื่องมือที่ประกาศไว้ แสดงแถบจริง {shown}/8", not missing, str(missing))

    nodecl = [t for t in ALL if t not in IO][:4]
    bad = []
    for tid in nodecl:
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_timeout(900)
        if pg.evaluate("() => !!document.querySelector('.tex')"): bad.append(tid)
    ck(f"② เครื่องมือที่ไม่มีข้อมูลวัดไว้ ต้องไม่แสดงอะไร (ตรวจ {len(nodecl)} ตัว)", not bad, str(bad))

    for tid in VERIFY:
        want = IO.get(tid)
        if not want:
            ck(f"③ {tid} ต้องมีข้อมูลวัดไว้", False, "ไม่มีในไฟล์")
            continue
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_timeout(900)
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").filter(visible=True).first.click()
        pg.wait_for_timeout(4200)
        got_in = pg.evaluate("() => document.querySelectorAll('.file-row').length")
        # ‼️ ต้องกด "ปุ่มที่ผู้ใช้เห็นจริง" ไม่ใช่ปุ่มใน .actions (แก้ 21/09/2026)
        #    หน้าเครื่องมือ v2 ยกปุ่มลงมือทำขึ้นไปเป็นปุ่มหลักในแผงขวา แล้วซ่อนปุ่มเดิมใน
        #    ผืนงานทิ้ง (คลาส s2-lifted) ตัวหาเดิมกรองด้วย offsetParent จึงได้ null ทุกตัว
        #    และรายงานว่า "แสดงแถบจริง 0/8" ทั้งที่เครื่องมือทำงานปกติ
        pg.evaluate("""() => {
            const skip = /คัดลอก|Copy|ดาวน์โหลด|Download|โหลดไว้|ล้าง|Clear|รีเซ็ต|Reset/i;
            /* ‼️ ไล่ตามลำดับความสำคัญ ห้ามใช้ querySelector ที่รวมหลายตัวเลือก (22/09/2026)
               querySelector คืน "ตัวแรกตามลำดับในหน้า" ซึ่งคือ .actions ในผืนงานที่มาก่อนแผงขวา
               ปุ่มในนั้นถูกซ่อนไว้หลังบ้านแล้ว ตัวหาเลยไม่เจออะไรกด แล้วรายงานว่า "ไม่มีแถวผลลัพธ์" 17 ตัว */
            const scopes = ['.s2-cta-row', '.s2-side-ft', '.actions', '.ws-footer']
              .flatMap((q) => [...document.querySelectorAll(q)]);
            for (const scope of scopes) {
              const b = [...scope.querySelectorAll('button')]
                .find(e => e.offsetParent && !e.disabled && !e.classList.contains('ghost') && !skip.test(e.textContent));
              if (b) { b.click(); return; }
            }
        }""")
        pg.wait_for_timeout(8000)
        got = pg.evaluate("""() => {
            const r = document.querySelector('.result');
            if (!r) return null;
            return { name: (r.querySelector('.r-name strong') || {}).textContent || '',
                     size: (r.querySelector('.r-size') || {}).textContent || '',
                     meta: (r.querySelector('.r-name small') || {}).textContent || '' };
        }""")
        if not got:
            ck(f"③ {tid} รันจริงแล้วต้องได้ผลลัพธ์", False, "ไม่มีแถวผลลัพธ์")
            continue
        ext = (got["name"].rsplit(".", 1)[-1] or "").lower()
        ok = (got_in == want["n"] and ext == want["outExt"]
              and size_close(got["size"], want["outSize"]) and got["meta"].strip() == want["outMeta"])
        ck(f"③ {tid} รันจริงตรงกับที่ประกาศ ({want['n']} ไฟล์ → .{want['outExt']} {want['outSize']} {want['outMeta']})",
           ok, f"ได้ {got_in} ไฟล์ → .{ext} {got['size'].strip()} {got['meta'].strip()}")

    # ④ อ่านออกทั้งสองโหมด
    for mode in ("light", "dark"):
        c2 = br.new_context(viewport={"width": 1440, "height": 950}, color_scheme=mode)
        p2 = c2.new_page()
        p2.goto(f"{BASE}/#/pdf-merge", wait_until="networkidle")
        p2.wait_for_timeout(1000)
        # ‼️ ต้องเทียบกับพื้นที่อยู่หลังตัวหนังสือจริง ไม่ใช่ตัวแปร --stage (แก้ 22/09/2026)
        #    v2 ย้ายแถบนี้ไปอยู่ใต้จอแรกของหน้าเปล่าซึ่งพื้นสว่าง แต่ --stage ยังเป็นสีเข้มของผืนงานเดิม
        #    เทสเลยรายงาน 1.11:1 ทั้งที่ภาพจริงเป็นตัวหนังสือเข้มบนพื้นสว่าง อ่านชัด
        #    จึงไล่ขึ้นไปหาพื้นทึบตัวแรก แล้วซ้อนพื้นโปร่งแสงทุกชั้นทับลงไปตามลำดับ
        d = p2.evaluate("""() => {
            const parse = (c) => {
              let m = c.match(/^rgba?\\(([^)]+)\\)/);
              if (m) { const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
              m = c.match(/^color\\(srgb ([^)]+)\\)/);
              if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
              return null;
            };
            const behind = (e) => {
              const layers = [];
              for (let n = e; n; n = n.parentElement) {
                const c = parse(getComputedStyle(n).backgroundColor);
                if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
              }
              let base = [255, 255, 255];
              for (const l of layers.reverse()) base = base.map((v, i) => v * (1 - l[3]) + l[i] * l[3]);
              return `rgb(${base.map(Math.round).join(',')})`;
            };
            const t = document.querySelector('.tex');
            return [...t.querySelectorAll('.tex-box b, .tex-box span')].map(e => [getComputedStyle(e).color, behind(e)]);
        }""")
        worst = min(ratio(c, bg) for c, bg in d)
        ck(f"④ โหมด{'สว่าง' if mode == 'light' else 'มืด'} ตัวหนังสือในแถบอ่านออก (แย่สุด {worst:.2f}:1)",
           worst >= 4.5, f"{worst:.2f}")
        c2.close()

    # ⑤ ‼️ ข้อมูลฝั่งอังกฤษต้องไม่มีตัวอักษรไทยหลงเหลือ
    #    เคยหลุดมาแล้วเพราะ meta เป็นรายชื่อไฟล์ตัวอย่างซึ่งชื่อเป็นไทย
    # ‼️ ยกเว้นช่องที่เป็น "ชื่อไฟล์" เพราะชื่อไฟล์ตัวอย่างเป็นภาษาไทยโดยธรรมชาติ
    #    และไม่ได้แปลตามภาษาของหน้าเว็บ (ตัวแสดงผลตัดช่องพวกนี้ทิ้งอยู่แล้ว ดู tidy ใน ui.js)
    def en_text(v):
        return " ".join(str(x) for k, x in v.items() if not re.search(r"\.\w{2,5}\b", str(x)))
    th_in_en = [k for k, v in ALL_IO.items() if re.search(r"[\u0E00-\u0E7F]", en_text(v["en"]))]
    ck(f"⑤ ข้อมูลอังกฤษไม่มีไทยตกค้าง ยกเว้นชื่อไฟล์ (ตรวจ {len(ALL_IO)} เครื่องมือ)",
       not th_in_en, str(th_in_en))
    ck("⑤ ทุกเครื่องมือมีข้อมูลครบทั้งสองภาษา และชนิดไฟล์ผลลัพธ์ตรงกัน",
       all(v["th"]["outExt"] == v["en"]["outExt"] and v["th"]["n"] == v["en"]["n"] for v in ALL_IO.values()))

    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
