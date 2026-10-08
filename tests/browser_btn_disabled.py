"""ปุ่มที่กดไม่ได้ ต้องไม่ยกตัวตอนชี้เมาส์ (งานรอ 03/10/2026 เห็นในภาพจอรอบ 2 ของครอบตัดขอบ ปุ่ม Clear the frame ลอย 2 px)

ตรวจ 5 อย่าง
   ① ปุ่ม .btn ที่กดได้ ชี้แล้วยกตัว (คู่ควบคุม พิสูจน์ว่าตัวตรวจเห็นการยกจริง ไม่ใช่เขียวเพราะ transform ว่างทุกกรณี)
   ② ปุ่ม .btn ที่ disabled ชี้แล้ว transform ต้องเป็น none และตำแหน่งบนจอไม่ขยับ
   ③ ปุ่ม disabled ชี้แล้วไม่มีเงาสีเน้นของ hover
   ④ ผู้ใช้ที่ตั้งลดการเคลื่อนไหว ปุ่มที่กดได้ชี้แล้วก็ไม่ยก (กันกฎใหม่ที่เจาะจงกว่าไปทับกฎ reduced motion)
   ⑤ index.html มีกฎ hover ชุดเดียวกับ tool.css (หน้าแรกมีสำเนากฎของตัวเอง ต้องแก้คู่กัน)

รัน: tests/run.sh browser_btn_disabled
"""
import os, re, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parents[1]
fails = []
def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok: fails.append(label)

def open_tool_page(pg, tid):
    prev = pg.title()
    pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
    pg.wait_for_function(
        "(prev) => document.title !== prev && !document.querySelector('#tool .loading')"
        " && !!document.querySelector('#tool .s2, #tool .tool-head')", arg=prev, timeout=30000)

def hover_probe(pg, sel):
    pg.mouse.move(5, 5); pg.wait_for_timeout(350)
    top0 = pg.evaluate(f"() => document.querySelector('{sel}').getBoundingClientRect().top")
    pg.hover(sel, force=True); pg.wait_for_timeout(450)      # force: ปุ่ม disabled Playwright ไม่ยอมชี้ให้ถ้าไม่บังคับ
    return pg.evaluate(f"""(top0) => {{ const b = document.querySelector('{sel}'), s = getComputedStyle(b);
        return {{ transform: s.transform, shadow: s.boxShadow, dy: b.getBoundingClientRect().top - top0,
                 hovered: b.matches(':hover') }}; }}""", top0)

with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page(viewport={"width": 1280, "height": 900})
    open_tool_page(pg, "pdf-crop")
    pg.evaluate("""() => { const w = document.createElement('div');
        w.style.cssText = 'position:fixed;left:40px;top:300px;z-index:99999;display:flex;gap:16px';
        w.innerHTML = '<button class="btn" id="fk-en">กดได้</button><button class="btn" id="fk-dis" disabled>กดไม่ได้</button>';
        document.body.appendChild(w); }""")
    en = hover_probe(pg, "#fk-en")
    ck("① ปุ่มที่กดได้ ชี้แล้วยกตัว (คู่ควบคุม)", en["hovered"] and en["transform"] != "none" and en["dy"] < -0.5, en)
    dis = hover_probe(pg, "#fk-dis")
    ck("② ปุ่ม disabled ชี้แล้วไม่ยก transform none ตำแหน่งไม่ขยับ",
       dis["hovered"] and dis["transform"] == "none" and abs(dis["dy"]) < 0.5, dis)
    ck("③ ปุ่ม disabled ชี้แล้วไม่มีเงาสีเน้น", dis["shadow"] in ("none", ""), dis["shadow"])
    pg.emulate_media(reduced_motion="reduce")
    rm = hover_probe(pg, "#fk-en")
    ck("④ ตั้งลดการเคลื่อนไหว ปุ่มที่กดได้ชี้แล้วไม่ยก", rm["hovered"] and rm["transform"] == "none", rm)
    br.close()

css = (ROOT / "assets/css/tool.css").read_text(encoding="utf-8")
home = (ROOT / "index.html").read_text(encoding="utf-8")
bare = re.compile(r"(?<![\w-])\.btn:hover(?!:not\(:disabled\))")      # .btn:hover ที่ไม่ยกเว้น disabled (ไม่นับ .s2-cta.btn ที่มีกฎ disabled ของตัวเอง)
fixed = re.compile(r"(?<![\w-])\.btn:hover:not\(:disabled\)")
got = {n: (len(bare.findall(t)), len(fixed.findall(t))) for n, t in (("tool.css", css), ("index.html", home))}
ck("⑤ index.html กับ tool.css ทุกกฎ .btn:hover ยกเว้น disabled (ไม่เหลือแบบเดิม และมีกฎใหม่ทั้งคู่)",
   all(b == 0 and f > 0 for b, f in got.values()), got)

print(f"\n{'❌ แดง ' + str(len(fails)) + ' ข้อ' if fails else '✅ ผ่านครบ 5 ข้อ'}")
sys.exit(1 if fails else 0)
