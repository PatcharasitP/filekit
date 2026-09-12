"""ธีมที่เครื่องมือสร้าง ต้องผ่าน schema จริงของ Microsoft

‼️ เทสอื่นตรวจว่าเราใส่คีย์ตามที่ตั้งใจ เทสนี้ตรวจว่า Power BI จะยอมรับไฟล์นี้จริงไหม
   ใช้ไฟล์ schema ฉบับจริง reportThemeSchema-2.157.json ที่ดาวน์โหลดเก็บไว้ตั้งแต่ 31/08/2026
   ไม่ใช่การเดาจากเอกสาร

‼️ ข้อ ② เป็นตัวควบคุมเชิงลบ ถ้าไม่มี ข้อ ① อาจผ่านเพราะ schema ไม่ได้บังคับอะไรเลย
   ไม่ใช่เพราะธีมของเราถูก

รัน: python3 tests/theme_schema.py
ข้ามได้ถ้าไม่มีไฟล์ schema (ไม่ได้อยู่ในรีโป FileKit เพราะเป็นไฟล์ 1.2 MB ของ Microsoft)
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FK = os.path.dirname(HERE)
SCHEMA = os.path.join(os.path.dirname(FK), "References", "Themes", "schema", "reportThemeSchema-2.157.json")

if not os.path.exists(SCHEMA):
    print(f"ข้าม: ไม่พบไฟล์ schema ที่ {SCHEMA}")
    sys.exit(0)
try:
    import jsonschema
except ImportError:
    print("ข้าม: ยังไม่ได้ติดตั้ง jsonschema (pip install jsonschema)")
    sys.exit(0)

fails = []
def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("\n      " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

# ── สร้างธีมของทุกชุดสีด้วยโค้ดจริงของเครื่องมือ ───────────────────────
NODE = r'''
import { buildTheme, derive, PALETTES } from "./src/tools/pbi-theme.js";
const out = {};
for (const p of PALETTES()) {
  const s = derive({ name: "ตรวจ " + p.id, w: 1920, h: 1080, font: "Segoe UI",
    colors: p.colors.slice(), bg: p.bg, fg: p.fg,
    good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
  out[p.id] = buildTheme(s);
}
/* ผืนผ้าใบขนาดอื่นด้วย เพราะขนาดตัวอักษรที่คำนวณได้ต้องอยู่ในช่วงที่ schema ยอมรับ */
const base = PALETTES()[0];
for (const [w, h] of [[1280, 720], [2560, 1440], [900, 1600], [6000, 6000], [320, 240]]) {
  const s = derive({ name: `ตรวจ ${w}x${h}`, w, h, font: "Sarabun",
    colors: base.colors.slice(), bg: base.bg, fg: base.fg,
    good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
  out[`${w}x${h}`] = buildTheme(s);
}
console.log(JSON.stringify(out));
'''
r = subprocess.run(["node", "--input-type=module", "-e", NODE], cwd=FK,
                   capture_output=True, text=True)
line = [l for l in r.stdout.splitlines() if l.startswith("{")]
if not line:
    print("❌ เรียกโค้ดเครื่องมือไม่สำเร็จ:\n" + r.stderr[-800:])
    sys.exit(1)
themes = json.loads(line[-1])

schema = json.load(open(SCHEMA, encoding="utf-8"))
V = jsonschema.Draft7Validator(schema)

print(f"\n① ธีมที่เครื่องมือสร้าง ต้องผ่าน schema 2.157 ({len(themes)} แบบ)")
for name, t in themes.items():
    errs = sorted(V.iter_errors(t), key=lambda e: list(e.path))
    ck(f"{name}", not errs, "\n      ".join(f"{list(e.path)} {e.message[:140]}" for e in errs[:4]))

print("\n② ตัวควบคุมเชิงลบ ตัวตรวจต้องจับของผิดได้จริง")
good = themes[next(iter(themes))]
CASES = [
    ("ไม่มีคีย์ name ที่ schema บังคับ", lambda t: t.pop("name")),
    ("dataColors ใส่ค่าที่ไม่ใช่สี", lambda t: t.__setitem__("dataColors", ["ไม่ใช่สี"])),
    ("background ใส่ตัวเลขแทนสี", lambda t: t.__setitem__("background", 123)),
    ("fontSize ใส่ข้อความแทนตัวเลข", lambda t: t["textClasses"]["callout"].__setitem__("fontSize", "ใหญ่")),
]
for label, mutate in CASES:
    bad = json.loads(json.dumps(good))
    mutate(bad)
    ck(f"จับได้: {label}", bool(list(V.iter_errors(bad))))

print(f"\nผ่าน {'ครบ' if not fails else ''} · ตก {len(fails)}")
sys.exit(1 if fails else 0)
