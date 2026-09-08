"""
กันบั๊ก "ออฟไลน์แล้วเว็บพัง" — FileKit โฆษณาว่าใช้ได้แม้ไม่มีเน็ต (ปุ่ม "เตรียมใช้งานออฟไลน์")
เทสนี้เกิดจากเหตุการณ์เกือบพลาดจริง: เพิ่ม src/i18n.js (ทุกโมดูล import) แต่ลืมใส่ใน
PRECACHE ของ sw.js — ถ้าไม่จับ ใครกดเตรียมออฟไลน์แล้วตัดเน็ต = เปิดเครื่องมือไม่ขึ้นเลย

รันแบบตรวจอ่านโค้ด (ไม่ง้อเซิร์ฟเวอร์) + รันแบบใช้จริง (ตัดเน็ตจริงด้วย Playwright)
    FK_BASE=http://localhost:8953 tests/browser_offline.py
"""
import os, re, sys, time, pathlib, posixpath
import urllib.request, urllib.error, urllib.parse
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8899")  # ตั้ง FK_BASE เพื่อยิงใส่เว็บจริง

t0 = time.time()
P, F = 0, []
def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(f"{name}" + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f"  — {detail}" if (detail and not ok) else ""))


# ══════════════════════════════════════════════════════════════════════════
# ① กราฟ import แบบ static: ไล่ import/import() ทุกไฟล์ใน src/** (+ vendor ที่ import
#    แบบ dynamic) จาก entrypoint src/app.js แล้วเทียบกับ PRECACHE (sw.js) ∪
#    assetList() (src/offline.js) — ไฟล์ไหนที่โค้ดต้องใช้จริงแต่ไม่มีในทั้งสองรายการ = ตก
# ══════════════════════════════════════════════════════════════════════════

# ‼️ ยกเว้นรายไฟล์เท่านั้น (ห้ามยกเว้นทั้งกลุ่ม) — ว่างเปล่าโดยตั้งใจ ตอนนี้ยังไม่เจอไฟล์ไหน
#    ที่ควรยกเว้นจริง ๆ (เช่น ไฟล์ที่โหลดเฉพาะตอน dev) ถ้าจะเพิ่มต้องมีเหตุผลกำกับทุกบรรทัด
EXCEPTIONS = {
    # "src/some-dev-only.js": "โหลดเฉพาะตอน dev, ไม่ได้ ship จริง",
}

# ไฟล์ที่หน้าเว็บต้องใช้แต่ไม่ได้มาจากการไล่ import (index.html คือเอกสารตั้งต้นเอง,
# tool.css ถูกแทรกด้วย JS ผ่าน createElement ไม่ใช่ import, manifest ผูกด้วย <link> ใน <head>)
EXTRA_REQUIRED = {"index.html", "assets/css/tool.css", "manifest.webmanifest"}

STATIC_IMPORT_RE = re.compile(r'''\bimport\b[^'"()]*?\bfrom\s+["']([^"']+)["']''')
EXPORT_FROM_RE   = re.compile(r'''\bexport\b[^'"()]*?\bfrom\s+["']([^"']+)["']''')
SIDE_EFFECT_RE   = re.compile(r'''^\s*import\s+["']([^"']+)["']''', re.M)
DYNAMIC_STR_RE   = re.compile(r'''import\(\s*["']([^"']+)["']\s*\)''')
DYNAMIC_TPL_RE   = re.compile(r'''import\(\s*`([^`]*)`\s*\)''')


def strip_comments(src):
    """ลบคอมเมนต์คร่าว ๆ กัน regex ไป match ข้อความในคอมเมนต์ไทยที่บังเอิญมีคำว่า import/from
       (?<!:) กัน "https://..." ในสตริง URL ไม่ให้โดนตัดเป็นคอมเมนต์"""
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'(?<!:)//.*', '', src)
    return src


def resolve(from_rel, spec):
    """spec เป็น relative path ("./x.js" / "../y.js") จากไฟล์ from_rel (relative ต่อ ROOT)
       คืน path ที่ normalize แล้ว (relative ต่อ ROOT, ไม่มี "./" นำหน้า)"""
    base = posixpath.dirname(from_rel)
    return posixpath.normpath(posixpath.join(base, spec))


def extract_tool_ids():
    reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
    return re.findall(r'id:"([\w-]+)"', reg)


def parse_imports(rel_path, raw_text, tool_ids):
    """คืนลิสต์ dependency (path relative ต่อ ROOT) ของไฟล์ rel_path
       ถ้าเจอ dynamic import template ที่ไม่รู้จักรูปแบบ → โยน AssertionError (ห้ามเงียบ)"""
    clean = strip_comments(raw_text)
    out = []
    for rx in (STATIC_IMPORT_RE, EXPORT_FROM_RE, SIDE_EFFECT_RE, DYNAMIC_STR_RE):
        for m in rx.finditer(clean):
            out.append(resolve(rel_path, m.group(1)))
    for m in DYNAMIC_TPL_RE.finditer(clean):
        tpl = m.group(1)
        mm = re.match(r'^(.*)\$\{[\w.]+\}(.*)$', tpl)
        if not mm or mm.group(1) != "./tools/" or mm.group(2) != ".js":
            raise AssertionError(
                f"เจอ dynamic import template ที่เทสไม่รู้จักรูปแบบใน {rel_path}: `{tpl}` "
                "— ต้องอัปเดต tests/browser_offline.py ให้รองรับก่อน (ห้ามข้ามเงียบ ๆ)"
            )
        for tid in tool_ids:
            out.append(resolve(rel_path, f"./tools/{tid}.js"))
    return out


def build_required_graph(tool_ids):
    """BFS จาก src/app.js (entrypoint ที่ index.html โหลดด้วย <script type=module>)
       ไม่ recurse เข้า vendor/* (ไม่ใช่โมดูลของเราเอง — ยืนยันแล้วว่า vendor/easy-template-x.esm.js
       ไม่มี relative import ของตัวเอง จึงเป็น leaf node ที่ปลอดภัย)"""
    seen = set()
    queue = ["src/app.js"]
    while queue:
        rel = queue.pop()
        if rel in seen:
            continue
        seen.add(rel)
        if rel.startswith("vendor/"):
            continue
        fp = ROOT / rel
        if not fp.exists():
            continue  # จะโดนจับใน ③ existence check แยกอีกที
        text = fp.read_text(encoding="utf-8")
        for dep in parse_imports(rel, text, tool_ids):
            if dep not in seen:
                queue.append(dep)
    return (seen | EXTRA_REQUIRED) - set(EXCEPTIONS)


def normalize(path):
    return path.lstrip("./")


def extract_precache(sw_text):
    m = re.search(r'const PRECACHE\s*=\s*\[(.*?)\];', sw_text, re.S)
    if not m:
        return set()
    items = re.findall(r'"([^"]*)"', m.group(1))
    return {normalize(it) for it in items if normalize(it)}


def extract_version(sw_text):
    m = re.search(r'const VERSION\s*=\s*"([^"]+)"', sw_text)
    return m.group(1) if m else None


def extract_local_lib_files(loader_text):
    """สร้างค่าเทียบเท่า loader.js::localLibFiles() จากซอร์สโดยตรง (ไม่รัน JS จริง)"""
    files = set(re.findall(r'local:\s*"([^"]+)"', loader_text))
    if re.search(r'global:\s*"pdfjsLib"', loader_text):
        files.add("vendor/pdf.worker.min.js")
    return files


def extract_fonts(offline_text):
    m = re.search(r'const FONTS\s*=\s*\[(.*?)\];', offline_text, re.S)
    if not m:
        return set()
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def extract_offline_declared(offline_text, loader_text, tool_ids):
    """ตีความ assetList() ในไฟล์ src/offline.js จากซอร์สโดยตรง"""
    m = re.search(r'const assetList\s*=\s*\(\)\s*=>\s*\[(.*?)\];', offline_text, re.S)
    body = m.group(1) if m else ""
    out = set()
    if "...localLibFiles()" in body:
        out |= extract_local_lib_files(loader_text)
    if "...FONTS" in body:
        out |= extract_fonts(offline_text)
    if re.search(r'TOOLS\.map\(.*?`src/tools/\$\{[\w.]+\}\.js`', body, re.S):
        out |= {f"src/tools/{tid}.js" for tid in tool_ids}
    out |= set(re.findall(r'"([^"]+)"', body))  # ลิสต์ literal ที่เหลือ (backtick ไม่โดน regex นี้)
    return out


print("━━ ① กราฟ import แบบ static เทียบกับรายการแคช ━━")
tool_ids = extract_tool_ids()
ck("อ่านทะเบียนเครื่องมือได้ 27 ตัว", len(tool_ids) == 27, f"ได้ {len(tool_ids)} ตัว: {tool_ids}")

sw_text = (ROOT / "sw.js").read_text(encoding="utf-8")
offline_text = (ROOT / "src/offline.js").read_text(encoding="utf-8")
loader_text = (ROOT / "src/loader.js").read_text(encoding="utf-8")

required = build_required_graph(tool_ids)
ck("ไล่กราฟ import ได้ครบ (sanity: ควรได้ไฟล์เยอะกว่า 45 — 23 core + 27 tools + extras)",
   len(required) >= 45, f"ได้ {len(required)} ไฟล์ — ถ้าน้อยผิดปกติ แปลว่า parser พังไม่ใช่โค้ดพัง")

precache = extract_precache(sw_text)
ck("อ่าน PRECACHE จาก sw.js ได้ (sanity)", len(precache) >= 5, f"ได้ {len(precache)} รายการ")

declared_offline = extract_offline_declared(offline_text, loader_text, tool_ids)
ck("อ่านรายการ assetList() จาก src/offline.js ได้ (sanity)", len(declared_offline) >= 40,
   f"ได้ {len(declared_offline)} รายการ")

declared = precache | declared_offline
missing = sorted(required - declared)
ck("① ไฟล์ที่เว็บต้องใช้ทุกตัว ต้องอยู่ใน PRECACHE หรือรายการออฟไลน์อย่างน้อยหนึ่งที่",
   len(missing) == 0,
   f"ขาด {len(missing)} ไฟล์: {missing}" if missing else "")
if missing:
    print("     ── ไฟล์ที่โค้ดต้องใช้จริงแต่ไม่มีในรายการแคชเลย (ฟ้าจะเป็นคนเติม ไม่ใช่เทสนี้แก้เอง) ──")
    for m_ in missing:
        print(f"       · {m_}")


# ══════════════════════════════════════════════════════════════════════════
# DoD-proof (a): พิสูจน์ว่าเช็ค ① แดงได้จริง — ลบชื่อไฟล์ที่ปัจจุบันอยู่ในรายการออกจาก
# "สตริงในหน่วยความจำ" ของ sw.js/offline.js (ไม่แตะไฟล์จริงบนดิสก์) แล้ว rerun ตรรกะเทียบ
# ต้องเห็นไฟล์นั้นโผล่มาเป็น "missing" — ถ้าไม่โผล่ แปลว่าเช็ค ① เขียนมาผ่านหลอก
# ══════════════════════════════════════════════════════════════════════════
print("\n━━ DoD-proof (a): พิสูจน์ว่าเช็ค ① แดงได้จริงเมื่อไฟล์หลุดจากรายการ ━━")
covered_now = sorted((declared & required) - EXTRA_REQUIRED)
target = "src/ui.js" if "src/ui.js" in covered_now else (covered_now[0] if covered_now else None)
if target is None:
    ck("DoD-proof (a): มีไฟล์ตัวอย่างให้ทดลองลบ", False, "ไม่มีไฟล์ไหนอยู่ในรายการเลย ตั้งฐานพิสูจน์ไม่ได้")
else:
    ck(f"ก่อนลบ: '{target}' ต้องอยู่ในรายการอยู่แล้ว (ตั้งฐาน)", target in declared and target not in missing)
    sw_text_mod = sw_text.replace(target, "")
    offline_text_mod = offline_text.replace(target, "")
    declared_mod = extract_precache(sw_text_mod) | extract_offline_declared(offline_text_mod, loader_text, tool_ids)
    missing_mod = required - declared_mod
    ck(f"หลังลบ '{target}' ออกจากสตริง sw.js/offline.js ในหน่วยความจำ → เช็ค ① ต้องจับได้ว่าไฟล์หาย",
       target in missing_mod, f"missing_mod มี {len(missing_mod)} ไฟล์: {'พบ' if target in missing_mod else 'ไม่พบ'} '{target}'")


# ══════════════════════════════════════════════════════════════════════════
# ③ ไฟล์ทุกตัวที่ระบุในรายการ (PRECACHE ∪ offline list) และในกราฟ import ต้องมีอยู่จริง
#    บนเซิร์ฟเวอร์ (กันพิมพ์ path ผิดแล้วแคชไม่ติดเงียบ ๆ)
# ══════════════════════════════════════════════════════════════════════════
print("\n━━ ③ ตรวจว่าไฟล์ในรายการ + กราฟ import มีอยู่จริงบนเซิร์ฟเวอร์ (HEAD/GET) ━━")

def probe(base, path):
    url = (base.rstrip("/") + "/") if path == "" else (base.rstrip("/") + "/" + urllib.parse.quote(path, safe="/"))
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        if e.code in (405, 501):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=10) as r2:
                    return r2.status
            except urllib.error.HTTPError as e2:
                return e2.code
            except Exception:
                return -1
        return e.code
    except Exception:
        return -1

try:
    reachable = probe(BASE, "") == 200
except Exception:
    reachable = False
if not reachable:
    print(f"  ❌ เข้า {BASE} ไม่ได้เลย — ต้องรัน `python3 -m http.server` ที่โฟลเดอร์ FileKit ก่อน")
    F.append(f"เข้าเซิร์ฟเวอร์ {BASE} ไม่ได้ — ข้อ ③ และการทดสอบเบราว์เซอร์ทำต่อไม่ได้")
    print(f"\nผ่าน {P} ข้อ · ไม่ผ่าน {len(F)} ข้อ")
    for f_ in F:
        print(f"  ❌ {f_}")
    sys.exit(1)

all_paths = sorted(declared | required)
bad = []
for path in all_paths:
    status = probe(BASE, path)
    if status != 200:
        bad.append((path, status))
ck(f"③ ทุกไฟล์ในรายการ+กราฟ ({len(all_paths)} ไฟล์) ตอบ 200 บนเซิร์ฟเวอร์จริง",
   len(bad) == 0,
   ("404/error: " + ", ".join(f"{p}({s})" for p, s in bad)) if bad else "")


# ══════════════════════════════════════════════════════════════════════════
# ตรวจรูปแบบเลขเวอร์ชัน service worker (เทียบกับเวอร์ชันที่ deploy แล้วทำไม่ได้ใน static test — ข้าม)
# ══════════════════════════════════════════════════════════════════════════
print("\n━━ ตรวจ VERSION ใน sw.js (เทียบกับเวอร์ชัน deploy จริงข้ามไป — ทำใน static test ไม่ได้) ━━")
version = extract_version(sw_text)
ck("sw.js มีค่า VERSION และรูปแบบถูกต้อง (filekit-vN)",
   bool(version) and re.fullmatch(r"filekit-v\d+", version) is not None, f"VERSION={version!r}")


# ══════════════════════════════════════════════════════════════════════════
# ② ทดสอบใช้จริงด้วยเบราว์เซอร์: กดเตรียมใช้งานออฟไลน์ → ตัดเน็ตจริง (context.set_offline) →
#    เปิดหน้าแรกใหม่ + เครื่องมืออย่างน้อย 6 ตัวคละกลุ่ม → ต้องใช้งานได้ ไม่มี error
#    ก่อนหน้านั้น: DoD-proof (b) — ตัดเน็ตโดยไม่กดเตรียมออฟไลน์ก่อน ต้องเปิดเครื่องมือไม่ได้
#    (พิสูจน์ว่าเทสจับสถานะ "เตรียมแล้ว" กับ "ยังไม่เตรียม" ต่างกันได้จริง ไม่ใช่เขียวเสมอ)
# ══════════════════════════════════════════════════════════════════════════

SW_READY_JS = """
async () => {
  if (!('serviceWorker' in navigator)) return false;
  try { await navigator.serviceWorker.ready; } catch { return false; }
  if (navigator.serviceWorker.controller) return true;
  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, 8000);
  });
  return !!navigator.serviceWorker.controller;
}
"""

TEST_TOOLS = ["pdf-merge", "pdf-to-text", "image-resize", "word-mailmerge", "excel-csv", "thai-number"]

# ‼️ พิสูจน์ด้วยตาเนื้อแล้ว (ไม่ได้เดา): context.set_offline(True) เพียวๆ "ไม่ตัดเน็ตจริง"
#    กับ localhost/127.0.0.1 บน Chromium ในแซนด์บ็อกซ์ WSL นี้ — goto()/fetch() ยังได้ 200 ปกติ
#    หลังสั่ง set_offline(True) (เช็คด้วย request log จริง เห็นไฟล์ที่ไม่เคยแคชก็ยังโหลดผ่านเน็ตได้)
#    ต้องเสริม context.route("**/*", abort) เพื่อบล็อกเน็ตจริงอีกชั้น ถึงจะตัดเน็ตได้จริง —
#    ยังคงเรียก set_offline(True) ไว้ด้วย (ตามที่โจทย์สั่ง + เผื่อ environment อื่นที่มันทำงานได้จริง)
def go_truly_offline(ctx):
    ctx.set_offline(True)
    ctx.route("**/*", lambda route: route.abort())

def go_back_online(ctx):
    ctx.unroute("**/*")
    ctx.set_offline(False)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ── DoD-proof (b): baseline แดง — ไม่กดเตรียมออฟไลน์ก่อนตัดเน็ต ──
    print("\n━━ DoD-proof (b): ไม่กดเตรียมออฟไลน์ก่อน → ตัดเน็ต → เปิดเครื่องมือต้องไม่ได้ (baseline) ━━")
    ctx0 = browser.new_context(viewport={"width": 1280, "height": 1000})
    pg0 = ctx0.new_page()
    pg0.goto(BASE, wait_until="networkidle", timeout=30000)
    sw_ok0 = pg0.evaluate(SW_READY_JS)
    ck("DoD-proof (b): service worker ควบคุมหน้าได้ (ตั้งฐานให้ยุติธรรมกับกรณีจริง)", sw_ok0)
    go_truly_offline(ctx0)
    neg_tool = TEST_TOOLS[0]  # pdf-merge — ยังไม่เคยถูกเปิด/prefetch ในคอนเท็กซ์นี้เลย
    pg0.goto("about:blank")
    neg_opened = False
    neg_err_shown = False
    try:
        pg0.goto(f"{BASE}/#/{neg_tool}", timeout=15000)
        try:
            pg0.wait_for_selector(".status.show.err", timeout=10000)
            neg_err_shown = True
        except PWTimeout:
            neg_opened = pg0.locator(".dz, .tool-head").count() > 0
    except Exception:
        pass  # นับเป็น "เปิดไม่ได้" เช่นกัน — สอดคล้องกับสิ่งที่ต้องพิสูจน์
    ck(f"DoD-proof (b): ตัดเน็ตโดยไม่เตรียมก่อน → เปิด '{neg_tool}' ต้องล้มเหลวจริง (ไม่ใช่ทฤษฎี)",
       neg_err_shown or not neg_opened,
       "แต่กลับเปิดเครื่องมือขึ้นได้ปกติ ทั้งที่ไม่เคยกดเตรียมออฟไลน์ — แปลว่าเทสข้อ ② แยกสถานะไม่ได้จริง"
       if (not neg_err_shown and neg_opened) else "")
    go_back_online(ctx0)
    ctx0.close()

    # ── ② การทดสอบจริง ──
    print("\n━━ ② ใช้งานจริง: กดเตรียมออฟไลน์ → ตัดเน็ตจริง → เปิดหน้าแรก + เครื่องมือ 6 ตัว ━━")
    ctx = browser.new_context(viewport={"width": 1280, "height": 1000})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    pg.goto(BASE, wait_until="networkidle", timeout=30000)
    sw_ok = pg.evaluate(SW_READY_JS)
    ck("service worker ควบคุมหน้าได้ก่อนกดปุ่มเตรียมออฟไลน์ (ไม่งั้นแคชจะไม่ติดจริง)", sw_ok)

    try:
        pg.wait_for_selector(".ob-btn", timeout=15000)
        pg.click(".ob-btn")
        pg.wait_for_selector(".ob-ready, .ob-fail", timeout=90000)
        ready_ok = pg.locator(".ob-ready").count() > 0
    except PWTimeout:
        ready_ok = False
    ck("กดปุ่ม 'เตรียมใช้งานออฟไลน์' แล้วเสร็จสมบูรณ์ ไม่มีไฟล์โหลดพลาด", ready_ok)

    flag_ok = pg.evaluate("() => { try { return localStorage.getItem('filekit-offline-ready') === '1'; } catch { return false; } }")
    ck("ธง filekit-offline-ready ถูกตั้งเป็น '1' หลังเตรียมเสร็จ", bool(flag_ok))

    go_truly_offline(ctx)

    errs.clear()
    pg.goto("about:blank")
    pg.goto(BASE, wait_until="networkidle", timeout=30000)
    home_errs = [e for e in errs if "favicon" not in e.lower()]
    ck("ตัดเน็ตจริงแล้วเปิดหน้าแรกใหม่ → ป้ายเครื่องมือขึ้นครบ 27 ใบ",
       pg.locator("button.pill").count() == 27,
       f"ได้ {pg.locator('button.pill').count()} ใบ")
    ck("หน้าแรกออฟไลน์ไม่มี console error", len(home_errs) == 0, home_errs[0][:150] if home_errs else "")

    for tool in TEST_TOOLS:
        errs.clear()
        pg.goto("about:blank")
        try:
            pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle", timeout=20000)
            pg.wait_for_selector(".dz, .tool-head", timeout=15000)
            has_err_panel = pg.locator(".status.show.err").count() > 0
            real_errs = [e for e in errs if "favicon" not in e.lower()]
            ok = not has_err_panel and not real_errs
            detail = ""
            if has_err_panel:
                detail = "หน้า error: " + pg.locator(".status.show.err").first.inner_text()[:150]
            elif real_errs:
                detail = "console error: " + real_errs[0][:150]
            ck(f"② ออฟไลน์เปิดเครื่องมือได้จริง: {tool}", ok, detail)
        except Exception as e:
            ck(f"② ออฟไลน์เปิดเครื่องมือได้จริง: {tool}", False, str(e)[:150])

    go_back_online(ctx)
    ctx.close()
    browser.close()


elapsed = time.time() - t0
print("\n" + "━" * 60)
print(f"ผ่าน {P} ข้อ · ไม่ผ่าน {len(F)} ข้อ · ใช้เวลา {elapsed:.1f} วินาที")
if F:
    print("\nรายการที่ไม่ผ่าน:")
    for f_ in F:
        print(f"  ❌ {f_}")
sys.exit(1 if F else 0)
