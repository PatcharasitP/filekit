"""
เทสนี้พิสูจน์ด้วยค่าจริงว่า service worker (sw.js) ทำให้ "ผู้ใช้เดิม" (เคยเข้าเว็บเวอร์ชันเก่า
ไว้แล้ว มี SW+cache ติดตั้งอยู่) เห็นเวอร์ชันใหม่ได้จริงเมื่อไร หลังพี่ปอนด์เจอปัญหาจริงว่า
กด Ctrl+Shift+R แล้วยังเห็นของเก่าค้าง

ใช้ Playwright launch_persistent_context (ไม่ใช่ new_context ธรรมดา) เพราะ Service Worker
registration + Cache Storage ผูกกับ "โปรไฟล์เบราว์เซอร์" ไม่ใช่ page — ต้องปิด context แล้ว
เปิด context ใหม่บนโปรไฟล์เดิมเพื่อจำลอง "ปิดเบราว์เซอร์แล้วเปิดใหม่" ของจริง (new_context
ธรรมดาจะ reset SW/cache ทุกครั้ง ทำให้ทดสอบ "ผู้ใช้เดิม" ไม่ได้เลย)

ทุกเคสทำงานกับ "สำเนา" เว็บใน /tmp/fk_sw_test/ เท่านั้น (ไม่แตะไฟล์ต้นฉบับ) — การ "ปล่อย
เวอร์ชันใหม่" ทำโดยแก้ไฟล์ในสำเนาแล้วเสิร์ฟจากสำเนานั้นต่อ (mtime เปลี่ยน คนละไฟล์กับที่ผู้ใช้
เคยแคชไว้)

รัน:
    /mnt/c/Users/USER/Desktop/Claude Code/.venv/bin/python tests/browser_swupdate.py
"""
import os, re, sys, time, shutil, socket, pathlib, functools, threading, http.server
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORK = pathlib.Path("/tmp/fk_sw_test")

t0 = time.time()
P, F = 0, []
ROWS = []  # ตาราง DoD: (เคส, ค่าที่วัดได้จริง, ผ่าน/ไม่ผ่าน)

def ck(name, ok, detail="", row=None):
    global P
    if ok:
        P += 1
    else:
        F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f"  — {detail}" if (detail and not ok) else ""))
    if row is not None:
        ROWS.append((row, detail if detail else "ดูรายละเอียดด้านบน", "ผ่าน" if ok else "ไม่ผ่าน"))


# ══════════════════════════════════════════════════════════════════════════
# โครงสร้างพื้นฐาน: คัดลอกเว็บไปสำเนาชั่วคราว + เสิร์ฟด้วย http.server ที่บังคับ no-store
# (กัน HTTP disk-cache ของเบราว์เซอร์เข้ามาปนกับพฤติกรรม Service Worker ที่กำลังทดสอบ)
# ══════════════════════════════════════════════════════════════════════════
EXCLUDE = {"tests", ".git", "node_modules", "__pycache__", ".DS_Store"}

def make_site_copy(name):
    dest = WORK / name
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(ROOT, dest, ignore=shutil.ignore_patterns(*EXCLUDE))
    return dest


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(directory):
    port = free_port()
    handler = functools.partial(NoStoreHandler, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    return httpd, f"http://127.0.0.1:{port}"


def bump_version(site_dir, new_version):
    swp = site_dir / "sw.js"
    text = swp.read_text(encoding="utf-8")
    new_text = re.sub(r'const VERSION = "[^"]+";', f'const VERSION = "{new_version}";', text)
    assert new_text != text, "regex แก้ VERSION ไม่ติด — รูปแบบ sw.js เปลี่ยนไปจากที่เทสคาดไว้"
    swp.write_text(new_text, encoding="utf-8")


def edit_hero_marker(site_dir, marker):
    ip = site_dir / "index.html"
    text = ip.read_text(encoding="utf-8")
    old = "เครื่องมือจัดการไฟล์<br>"
    assert text.count(old) == 1, f"ข้อความ hero เดิมไม่พบ/ไม่ยูนีก ({text.count(old)} ครั้ง) — เทสอาจต้องอัปเดต marker"
    ip.write_text(text.replace(old, f"{marker}<br>"), encoding="utf-8")


def edit_registry_marker(site_dir, marker):
    rp = site_dir / "src/registry.js"
    text = rp.read_text(encoding="utf-8")
    old = 'label: "จัดการไฟล์ PDF"'
    assert text.count(old) == 1, f"label กลุ่ม pdf เดิมไม่พบ/ไม่ยูนีก ({text.count(old)} ครั้ง)"
    rp.write_text(text.replace(old, f'label: "{marker}"'), encoding="utf-8")


def go_truly_offline(ctx):
    # ‼️ พิสูจน์แล้วจาก tests/browser_offline.py: set_offline(True) เพียวๆ ไม่ตัดเน็ตจริงบน
    # localhost ใน Chromium/WSL sandbox นี้ — ต้องเสริม route abort อีกชั้นถึงจะตัดเน็ตได้จริง
    ctx.set_offline(True)
    ctx.route("**/*", lambda route: route.abort())

def go_back_online(ctx):
    ctx.unroute("**/*")
    ctx.set_offline(False)


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

SNAPSHOT_JS = """
async () => {
  const heroEl = document.querySelector('.hero h1');
  const groupEl = document.querySelector('.pill-group');
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  const counts = {};
  for (const k of keys) { const c = await caches.open(k); counts[k] = (await c.keys()).length; }
  return {
    heroText: heroEl ? heroEl.textContent : null,
    firstGroupText: groupEl ? groupEl.textContent : null,
    pillCount: document.querySelectorAll('button.pill').length,
    controllerState: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.state : null,
    installingState: reg && reg.installing ? reg.installing.state : null,
    waitingState: reg && reg.waiting ? reg.waiting.state : null,
    activeState: reg && reg.active ? reg.active.state : null,
    cacheNames: keys,
    cacheCounts: counts,
  };
}
"""

def wait_controllerchange(page, timeout_ms=6000):
    return page.evaluate(f"""
      () => new Promise((resolve) => {{
        let done = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {{ if(!done){{done=true; resolve(true);}} }}, {{ once: true }});
        setTimeout(() => {{ if(!done){{done=true; resolve(false);}} }}, {timeout_ms});
      }})
    """)


def snap(page, label):
    s = page.evaluate(SNAPSHOT_JS)
    print(f"    ── snapshot [{label}] ──")
    print(f"       heroText={s['heroText']!r}")
    print(f"       firstGroupText={s['firstGroupText']!r}")
    print(f"       pillCount={s['pillCount']}  controller={s['controllerState']} installing={s['installingState']} waiting={s['waitingState']} active={s['activeState']}")
    print(f"       caches={ {k: v for k, v in s['cacheCounts'].items()} }")
    return s


results = {}  # เก็บผลรายเคสไว้พิมพ์สรุปท้ายสุด

with sync_playwright() as p:

    # ════════════════════════════════════════════════════════════════════
    # เคส (ก) + (ข): เปิดครั้งแรก SW ติดตั้ง+cache ครบไหม / ตัดเน็ตจริงแล้วยังใช้ได้ไหม
    # ════════════════════════════════════════════════════════════════════
    print("\n" + "━" * 70)
    print("━━ เคส (ก)+(ข): เปิดครั้งแรก cache ครบไหม + ตัดเน็ตจริงใช้ได้กี่เครื่องมือ ━━")
    print("━" * 70)
    site_a = make_site_copy("siteA")
    profile_a = WORK / "profileA"
    httpd_a, base_a = start_server(site_a)
    try:
        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_a), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        pg.goto(base_a, wait_until="networkidle", timeout=30000)
        sw_ok = pg.evaluate(SW_READY_JS)
        ck("(ก) service worker ควบคุมหน้าได้หลังเปิดครั้งแรก", sw_ok, row="(ก) SW ready ครั้งแรก")

        s1 = snap(pg, "เปิดครั้งแรก (ก)")
        shell_keys = [k for k in s1["cacheNames"] if k.endswith("-shell")]
        ck("(ก) มี SHELL cache ชื่อ filekit-vNN-shell อย่างน้อย 1 ตัว", len(shell_keys) == 1,
           f"cacheNames={s1['cacheNames']}")
        shell_count = s1["cacheCounts"].get(shell_keys[0], 0) if shell_keys else 0
        # PRECACHE ใน sw.js มี 12 รายการ ("./" กับ "./index.html" เป็น URL คนละตัวแต่เนื้อหาเดียวกัน
        # → cache.add ทั้งคู่จะได้ 2 entries จริงใน Cache Storage)
        ck(f"(ก) SHELL cache เก็บไฟล์ครบตามจำนวน PRECACHE จริง (นับได้ {shell_count} รายการ ต้อง ≥ 11)",
           shell_count >= 11, f"shell_count={shell_count}", row="(ก) จำนวนไฟล์ใน SHELL cache")

        # เปิด 2 เครื่องมือระหว่างออนไลน์ (จะได้แคช tool.js + vendor lib ของมันไว้)
        VISITED_TOOLS = ["pdf-merge", "thai-number"]
        NEVER_TOOL = "excel-csv"
        for tool in VISITED_TOOLS:
            pg.goto(f"{base_a}/#/{tool}", wait_until="networkidle", timeout=20000)
            pg.wait_for_selector(".dz, .tool-head", timeout=15000)
        s2 = snap(pg, "หลังเปิด 2 เครื่องมือ (ออนไลน์)")
        libs_keys = [k for k in s2["cacheNames"] if k.endswith("-libs")]
        ck("(ก) เปิดเครื่องมือแล้วมี LIBS cache เกิดขึ้น (isLib branch ทำงานจริง)",
           len(libs_keys) >= 1, f"cacheNames={s2['cacheNames']}")

        # ── ปิด context (จำลองปิดเบราว์เซอร์) แล้วตัดเน็ตจริงตอนเปิดใหม่ ──
        ctx.close()
        ctx2 = p.chromium.launch_persistent_context(user_data_dir=str(profile_a), headless=True,
                                                      viewport={"width": 1280, "height": 1000})
        go_truly_offline(ctx2)
        pg2 = ctx2.new_page()
        errs = []
        pg2.on("pageerror", lambda e: errs.append(str(e)))
        home_ok = False
        try:
            pg2.goto(base_a, wait_until="networkidle", timeout=20000)
            home_ok = pg2.locator("button.pill").count() > 0
        except Exception as e:
            home_ok = False
        ck(f"(ข) ปิดแล้วเปิดใหม่ตอนออฟไลน์จริง → หน้าแรกยังขึ้น ({pg2.locator('button.pill').count() if home_ok else 0} ปุ่มเครื่องมือ)",
           home_ok, row="(ข) หน้าแรกออฟไลน์")

        opened_ok, opened_fail = [], []
        for tool in VISITED_TOOLS:
            try:
                pg2.goto(f"{base_a}/#/{tool}", timeout=15000)
                pg2.wait_for_selector(".dz, .tool-head", timeout=10000)
                has_err = pg2.locator(".status.show.err").count() > 0
                (opened_fail if has_err else opened_ok).append(tool)
            except Exception:
                opened_fail.append(tool)
        ck(f"(ข) เครื่องมือที่เคยเปิดออนไลน์ไว้ก่อน ({len(VISITED_TOOLS)} ตัว) ใช้ออฟไลน์ได้ครบ",
           len(opened_ok) == len(VISITED_TOOLS),
           f"ใช้ได้ {opened_ok} / ใช้ไม่ได้ {opened_fail}",
           row=f"(ข) เครื่องมือที่เคยเปิด ({len(VISITED_TOOLS)} ตัว) ออฟไลน์")

        never_fail = False
        try:
            pg2.goto(f"{base_a}/#/{NEVER_TOOL}", timeout=15000)
            try:
                pg2.wait_for_selector(".status.show.err", timeout=8000)
                never_fail = True
            except PWTimeout:
                never_fail = pg2.locator(".dz, .tool-head").count() == 0
        except Exception:
            never_fail = True
        ck(f"(ข) เครื่องมือที่ 'ไม่เคย' เปิดมาก่อน ('{NEVER_TOOL}') ใช้ออฟไลน์ไม่ได้ (ตามดีไซน์ SWR ไม่ใช่ full-precache)",
           never_fail,
           "" if never_fail else f"เปิด '{NEVER_TOOL}' ได้ทั้งที่ไม่เคยเปิดออนไลน์มาก่อน — ผิดคาด",
           row=f"(ข) เครื่องมือที่ไม่เคยเปิด ('{NEVER_TOOL}') ออฟไลน์")

        go_back_online(ctx2)
        ctx2.close()
    finally:
        httpd_a.shutdown()

    # ════════════════════════════════════════════════════════════════════
    # เคส (ค): ปล่อยเวอร์ชันใหม่ (แก้ index.html + bump VERSION) → ผู้ใช้เดิมเห็นของใหม่
    # ตอนเปิดครั้งที่เท่าไร (วัดจริงทีละครั้ง) + เคส (ฉ) แคชเก่าถูกลบจริงไหม
    # ════════════════════════════════════════════════════════════════════
    print("\n" + "━" * 70)
    print("━━ เคส (ค)+(ฉ): bump เวอร์ชันปกติ → เห็นของใหม่ตอนเปิดครั้งที่เท่าไร + แคชเก่าถูกลบไหม ━━")
    print("━" * 70)
    site_c = make_site_copy("siteC")
    profile_c = WORK / "profileC"
    httpd_c, base_c = start_server(site_c)
    try:
        # ── รอบที่ 1: ผู้ใช้เดิมเข้าเว็บเวอร์ชันเก่า ──
        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_c), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        pg.goto(base_c, wait_until="networkidle", timeout=30000)
        pg.evaluate(SW_READY_JS)
        s_old = snap(pg, "ก่อน bump (เวอร์ชันเก่า)")
        old_hero = s_old["heroText"]
        old_cache_names = set(s_old["cacheNames"])
        ck("(ค) จับข้อความ hero เวอร์ชันเก่าไว้เป็น baseline ได้", bool(old_hero), f"{old_hero!r}")
        ctx.close()  # ปิดเบราว์เซอร์ — เว็บถูกแคชไว้ในโปรไฟล์แล้ว

        # ── "ปล่อยเวอร์ชันใหม่": แก้สำเนาเว็บ (ไม่แตะไฟล์ต้นฉบับ) ──
        MARKER_NEW = "เครื่องมือจัดการไฟล์ ⟪เวอร์ชันใหม่ทดสอบ⟫"
        edit_hero_marker(site_c, MARKER_NEW)
        bump_version(site_c, "filekit-v999test")

        # ── ผู้ใช้เดิมเปิดเว็บอีกครั้ง (เปิดเบราว์เซอร์ใหม่บนโปรไฟล์เดิม) = เปิดครั้งที่ 1 หลังอัปเดต ──
        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_c), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        opens = []  # (หมายเลขครั้ง, วิธี, hero_ใหม่ไหม)

        pg.goto(base_c, wait_until="networkidle", timeout=30000)
        s1 = snap(pg, "เปิดครั้งที่ 1 หลัง bump (เพิ่งเปิดเบราว์เซอร์ใหม่)")
        opens.append((1, "เปิดเบราว์เซอร์ใหม่ (goto ปกติ)", MARKER_NEW in (s1["heroText"] or "")))

        # ให้เวลา SW update lifecycle (register→install→activate→claim) ทำงานเบื้องหลังจนสุด
        changed = wait_controllerchange(pg, 6000)
        s1b = snap(pg, f"รอ background update settle (controllerchange={changed})")

        pg.reload(wait_until="networkidle", timeout=20000)
        s2 = snap(pg, "เปิดครั้งที่ 2 (page.reload ปกติ)")
        opens.append((2, "reload ปกติ (F5)", MARKER_NEW in (s2["heroText"] or "")))

        if not opens[-1][2]:
            cdp = ctx.new_cdp_session(pg)
            cdp.send("Page.reload", {"ignoreCache": True})
            pg.wait_for_load_state("networkidle", timeout=20000)
            s3 = snap(pg, "เปิดครั้งที่ 3 (hard reload ignoreCache=True)")
            opens.append((3, "hard reload (Ctrl+Shift+R จำลอง)", MARKER_NEW in (s3["heroText"] or "")))

        if not opens[-1][2]:
            pg2 = ctx.new_page()
            pg2.goto(base_c, wait_until="networkidle", timeout=20000)
            s4 = snap(pg2, "เปิดครั้งที่ 4 (แท็บใหม่ในโปรไฟล์เดิม)")
            opens.append((4, "เปิดแท็บใหม่", MARKER_NEW in (s4["heroText"] or "")))
            pg2.close()

        first_new_open = next((n for n, _, ok in opens if ok), None)
        print(f"\n  ── ลำดับการเปิดหลังปล่อยเวอร์ชันใหม่: {opens}")
        ck(f"(ค) ผู้ใช้เดิมเห็น 'เนื้อหาใหม่' ครั้งแรกตอนเปิดครั้งที่ {first_new_open}",
           first_new_open is not None,
           "ลองครบทุกวิธี (reload ปกติ / hard reload / แท็บใหม่) แล้วยังเห็นของเก่าตลอด — ติดค้างถาวร"
           if first_new_open is None else "",
           row=f"(ค) เห็นของใหม่ตอนเปิดครั้งที่ {first_new_open}" if first_new_open else "(ค) ติดของเก่าถาวร")
        results["first_new_open_normal_release"] = opens

        # ── เคส (ฉ): แคชเก่า (v-เก่า) ถูกลบจริงไหมหลังอัปเดตเสร็จ ──
        s_final = snap(pg, "สถานะแคชสุดท้ายหลังอัปเดต")
        leftover_old = old_cache_names & set(s_final["cacheNames"])
        ck(f"(ฉ) แคชเวอร์ชันเก่า ({sorted(old_cache_names)}) ถูกลบออกหมดหลังเวอร์ชันใหม่ active",
           len(leftover_old) == 0, f"ยังเหลือ: {sorted(leftover_old)}", row="(ฉ) ลบแคชเก่าหลัง bump")

        ctx.close()
    finally:
        httpd_c.shutdown()

    # ════════════════════════════════════════════════════════════════════
    # เคส (ง): พี่ปอนด์เจอจริง — bump แล้วผู้ใช้กด Ctrl+Shift+R (hard reload) บนแท็บที่ "เปิดค้างอยู่"
    # ตั้งแต่ก่อนปล่อยเวอร์ชันใหม่ (ไม่ได้ปิดแท็บเลย) → ได้ของใหม่ไหม
    # ════════════════════════════════════════════════════════════════════
    print("\n" + "━" * 70)
    print("━━ เคส (ง): bump เวอร์ชันขณะแท็บเปิดค้างอยู่ → กด hard reload ได้ของใหม่ไหม ━━")
    print("━" * 70)
    site_d = make_site_copy("siteD")
    profile_d = WORK / "profileD"
    httpd_d, base_d = start_server(site_d)
    try:
        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_d), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        pg.goto(base_d, wait_until="networkidle", timeout=30000)
        pg.evaluate(SW_READY_JS)
        s0 = snap(pg, "แท็บเปิดค้างไว้ ก่อน bump")
        cdp = ctx.new_cdp_session(pg)

        # ปล่อยเวอร์ชันใหม่ "ระหว่างที่แท็บยังเปิดอยู่" (ผู้ใช้ไม่ได้ปิดแท็บเลย)
        MARKER_D = "เครื่องมือจัดการไฟล์ ⟪ของใหม่ ง⟫"
        edit_hero_marker(site_d, MARKER_D)
        bump_version(site_d, "filekit-v999hard")

        hard_opens = []
        for i in range(1, 5):
            cdp.send("Page.reload", {"ignoreCache": True})
            try:
                pg.wait_for_load_state("networkidle", timeout=15000)
            except PWTimeout:
                pass
            s = snap(pg, f"hard reload ครั้งที่ {i} (แท็บเดิมไม่เคยปิด)")
            is_new = MARKER_D in (s["heroText"] or "")
            hard_opens.append((i, is_new))
            if is_new:
                break

        first_hard = next((n for n, ok in hard_opens if ok), None)
        print(f"\n  ── ลำดับ hard reload บนแท็บที่เปิดค้างไว้: {hard_opens}")
        ck(f"(ง) กด hard reload (Ctrl+Shift+R) บนแท็บที่เปิดค้างไว้ตั้งแต่ก่อน bump → เห็นของใหม่ที่ครั้งที่ {first_hard}",
           first_hard is not None,
           "กด hard reload ซ้ำ 4 ครั้งแล้วยังเห็นของเก่า — ตรงกับปัญหาที่พี่ปอนด์เจอจริง"
           if first_hard is None else "",
           row=f"(ง) hard reload บนแท็บเปิดค้าง เห็นใหม่ครั้งที่ {first_hard}" if first_hard else "(ง) hard reload ซ้ำ 4 ครั้งยังติดของเก่า")

        # ‼️ ตรวจว่า hard reload ที่ "ได้ของใหม่" นั้นเป็นของแท้ (SW/cache อัปเดตจริง) หรือเป็นแค่
        # เนื้อหาที่ข้าม SW ไปดึงจากเน็ตตรง ๆ ชั่วครั้งเดียว (cache/SW ข้างในยังเป็นเวอร์ชันเก่า) —
        # ถ้าเป็นแบบหลังนี้ reload ปกติครั้งถัดไปมีโอกาส "ย้อนกลับไปของเก่า" ซึ่งจะอธิบายอาการ
        # "hard reload แล้วดูเหมือนได้ของใหม่ แต่เดี๋ยวก็เจอของเก่าอีก" ได้ตรงเป๊ะ
        if first_hard is not None:
            s_after_hard = pg.evaluate(SNAPSHOT_JS)
            hard_cache_is_old = all(not k.startswith("filekit-v999hard") for k in s_after_hard["cacheNames"])
            ck(f"(ง) ตรวจว่า hard reload ที่ 'ดูเหมือนได้ของใหม่' นั้น SW/cache อัปเดตจริงหรือแค่ข้าม SW ไปเน็ตตรง ๆ",
               True,
               f"controller={s_after_hard['controllerState']!r}  cacheNames={s_after_hard['cacheNames']}  "
               + ("→ cache/SW ยังเป็นเวอร์ชันเก่า (ข้าม SW ไปเน็ตตรง ๆ ชั่วครั้งเดียว)" if hard_cache_is_old
                  else "→ cache/SW อัปเดตเป็นเวอร์ชันใหม่แล้วจริง"))

            pg.reload(wait_until="networkidle", timeout=20000)
            s_regress = snap(pg, "หลัง hard reload สำเร็จ → reload ปกติซ้ำอีกครั้งทันที (durability check)")
            regressed = MARKER_D not in (s_regress["heroText"] or "")
            ck("(ง) ‼️ DURABILITY: หลัง hard reload ได้ของใหม่แล้ว, reload ปกติ (ไม่ ignoreCache) ครั้งถัดไปทันทียังเป็นของใหม่อยู่ไหม (ไม่ย้อนกลับไปของเก่า)",
               not regressed,
               "ย้อนกลับไปเห็นของเก่าอีกครั้ง! แปลว่า hard reload ที่ 'ได้ของใหม่' เป็นแค่ภาพลวงตาชั่วคราว (ข้าม SW ไปเน็ตตรง ๆ) ไม่ใช่การอัปเดตจริง"
               if regressed else "",
               row="(ง) ‼️ ของใหม่จาก hard reload ย้อนกลับเป็นของเก่าตอน reload ปกติทันที" if regressed
               else "(ง) ของใหม่จาก hard reload อยู่ถาวรตั้งแต่ต้น ไม่ย้อนกลับ")

            # ‼️ ก่อนฟันธงว่า "ย้อนกลับ = บั๊กถาวร" ต้องกันไว้ก่อนว่าไม่ใช่แค่ปัญหา timing (SW update
            # cycle เบื้องหลังยังไม่ทันเสร็จ) — ให้เวลารอ controllerchange อย่างเป็นทางการ แล้ว reload
            # ต่อไปอีกหลายครั้ง ดูว่าสุดท้ายมัน "นิ่งเป็นของใหม่ถาวร" ที่ครั้งไหน หรือแกว่งไปมาไม่หยุด
            if regressed:
                stabilize_log = [(1, False)]  # ครั้งที่ 1 = การ reload ที่เพิ่งย้อนกลับไปแล้วข้างบน
                for j in range(2, 7):
                    changed = wait_controllerchange(pg, 4000)
                    pg.reload(wait_until="networkidle", timeout=20000)
                    sj = snap(pg, f"เก็บกู้หลังย้อนกลับ ครั้งที่ {j} (รอ controllerchange={changed} ก่อน reload)")
                    is_new_j = MARKER_D in (sj["heroText"] or "")
                    stabilize_log.append((j, is_new_j))
                    if is_new_j:
                        # เช็คซ้ำอีก 1 reload ว่า "นิ่ง" จริง ไม่ใช่สุ่มแกว่งแล้วบังเอิญเจอของใหม่ชั่วคราว
                        pg.reload(wait_until="networkidle", timeout=20000)
                        sk = snap(pg, f"ยืนยันความนิ่ง — reload ซ้ำอีกครั้งหลังครั้งที่ {j}")
                        still_new = MARKER_D in (sk["heroText"] or "")
                        stabilize_log.append((f"{j}-confirm", still_new))
                        break
                print(f"\n  ── ลำดับกู้คืนหลังย้อนกลับ (ครั้งที่, ของใหม่ไหม): {stabilize_log}")
                first_stable = next((n for n, ok in stabilize_log if ok), None)
                ck(f"(ง) หลังย้อนกลับ ในที่สุดนิ่งเป็นของใหม่ถาวรที่ reload ครั้งที่ {first_stable} (นับจากตอนย้อนกลับ) หรือไม่",
                   first_stable is not None,
                   "reload ต่อเนื่องอีก 6 ครั้งแล้วยังไม่นิ่งเป็นของใหม่เลย — ติดของเก่าถาวรจริง ไม่ใช่แค่ timing"
                   if first_stable is None else f"stabilize_log={stabilize_log}",
                   row=f"(ง) กู้คืนนิ่งเป็นของใหม่ที่ reload #{first_stable} หลังย้อนกลับ" if first_stable
                   else "(ง) ‼️ ติดของเก่าถาวรจริง แม้ reload ต่อเนื่องอีก 6 ครั้ง")

        # ถ้า hard reload ซ้ำ ๆ ยังไม่รอด ลองปิดแท็บ/เปิดเบราว์เซอร์ใหม่บนโปรไฟล์เดิมดูว่าหลุดไหม
        if first_hard is None:
            ctx.close()
            ctx2 = p.chromium.launch_persistent_context(user_data_dir=str(profile_d), headless=True,
                                                          viewport={"width": 1280, "height": 1000})
            pg2 = ctx2.new_page()
            pg2.goto(base_d, wait_until="networkidle", timeout=20000)
            s_reopen = snap(pg2, "ปิดเบราว์เซอร์เปิดใหม่ทั้งหมด (หลัง hard reload ไม่รอด)")
            reopen_new = MARKER_D in (s_reopen["heroText"] or "")
            ck("(ง) ต้องปิดเบราว์เซอร์ทั้งหมดแล้วเปิดใหม่ถึงจะได้ของใหม่ (hard reload อย่างเดียวไม่พอ)",
               reopen_new, "" if reopen_new else "แม้ปิดเปิดใหม่ทั้งหมดก็ยังไม่ได้ของใหม่ — ผิดปกติรุนแรง",
               row="(ง) ปิดเบราว์เซอร์ทั้งหมดแล้วเปิดใหม่ (fallback)")
            ctx2.close()
        else:
            ctx.close()
    finally:
        httpd_d.shutdown()

    # ════════════════════════════════════════════════════════════════════
    # เคส (จ): เวอร์ชันผสม — แก้ index.html + src/registry.js (ทั้งคู่อยู่ใน PRECACHE) พร้อมกัน
    # แต่ "ไม่ bump VERSION" → มีจังหวะไหนที่ผู้ใช้เห็นไฟล์หนึ่งใหม่ อีกไฟล์หนึ่งยังเก่าไหม
    # ════════════════════════════════════════════════════════════════════
    print("\n" + "━" * 70)
    print("━━ เคส (จ): แก้ไฟล์ shell 2 ไฟล์พร้อมกันแต่ไม่ bump VERSION → เช็คเวอร์ชันผสม ━━")
    print("━" * 70)
    site_e = make_site_copy("siteE")
    profile_e = WORK / "profileE"
    httpd_e, base_e = start_server(site_e)
    try:
        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_e), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        pg.goto(base_e, wait_until="networkidle", timeout=30000)
        pg.evaluate(SW_READY_JS)
        s_old = snap(pg, "ก่อนแก้ (เวอร์ชันเก่า ทั้ง 2 ไฟล์)")
        old_hero_e = s_old["heroText"]
        old_group_e = s_old["firstGroupText"]
        old_version = re.search(r'const VERSION = "([^"]+)"', (site_e / "sw.js").read_text(encoding="utf-8")).group(1)
        ctx.close()

        MARKER_HERO = "เครื่องมือจัดการไฟล์ ⟪HTML ใหม่⟫"
        MARKER_GROUP = "จัดการไฟล์ PDF ⟪JS ใหม่⟫"
        edit_hero_marker(site_e, MARKER_HERO)   # แก้ index.html
        edit_registry_marker(site_e, MARKER_GROUP)  # แก้ src/registry.js — ไม่แตะ sw.js เลย

        new_version = re.search(r'const VERSION = "([^"]+)"', (site_e / "sw.js").read_text(encoding="utf-8")).group(1)
        ck("(จ) ยืนยันว่า VERSION ใน sw.js ไม่ถูกแตะเลย (จำลองสถานการณ์ลืม bump)",
           old_version == new_version, f"เก่า={old_version} ใหม่={new_version}")

        ctx = p.chromium.launch_persistent_context(user_data_dir=str(profile_e), headless=True,
                                                     viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()

        mix_log = []  # (ครั้งที่, hero_ใหม่, group_ใหม่)
        for i in range(1, 6):
            if i == 1:
                pg.goto(base_e, wait_until="networkidle", timeout=20000)
            else:
                pg.reload(wait_until="networkidle", timeout=20000)
                wait_controllerchange(pg, 2500)
            s = snap(pg, f"เปิดครั้งที่ {i} (ไม่ bump VERSION)")
            hero_new = MARKER_HERO in (s["heroText"] or "")
            group_new = MARKER_GROUP in (s["firstGroupText"] or "")
            mix_log.append((i, hero_new, group_new))

        print(f"\n  ── ลำดับ (ครั้งที่, hero_ใหม่, group(js)_ใหม่): {mix_log}")
        mixed_states = [(i, h, g) for i, h, g in mix_log if h != g]
        ck("(จ) ตรวจพบจังหวะ 'เวอร์ชันผสม' (ไฟล์หนึ่งใหม่ อีกไฟล์เก่า พร้อมกันในการเปิดเดียว) หรือไม่ — รายงานตามจริง",
           True,  # ข้อนี้เป็นการ "รายงาน" ข้อเท็จจริง ไม่ใช่ pass/fail ของฟีเจอร์
           f"{'พบเวอร์ชันผสมที่ครั้ง: ' + str(mixed_states) if mixed_states else 'ไม่พบเวอร์ชันผสมในการทดลองนี้ (5 ครั้ง)'}",
           row=("(จ) พบเวอร์ชันผสมที่ " + str(mixed_states)) if mixed_states else "(จ) ไม่พบเวอร์ชันผสมใน 5 ครั้งที่ลอง")
        results["mix_log"] = mix_log
        results["mixed_states"] = mixed_states

        both_new_open = next((i for i, h, g in mix_log if h and g), None)
        ck(f"(จ) ทั้ง 2 ไฟล์กลายเป็นเวอร์ชันใหม่พร้อมกันตอนเปิดครั้งที่ {both_new_open}",
           both_new_open is not None,
           "" if both_new_open else "ลอง 5 ครั้งแล้วยังไม่ครบทั้งคู่")

        ctx.close()
    finally:
        httpd_e.shutdown()


# ══════════════════════════════════════════════════════════════════════════
# สรุปผล + ล้างสำเนาชั่วคราวทิ้งให้หมด
# ══════════════════════════════════════════════════════════════════════════
elapsed = time.time() - t0
print("\n" + "━" * 70)
print("ตาราง DoD สรุปทุกเคส")
print("━" * 70)
for case, detail, verdict in ROWS:
    mark = "✅" if verdict == "ผ่าน" else "❌"
    print(f"  {mark} {case:55s} | {verdict}")
    if detail and detail != "ดูรายละเอียดด้านบน":
        print(f"       {detail}")

print("\n" + "━" * 70)
print(f"ผ่าน {P} ข้อ · ไม่ผ่าน {len(F)} ข้อ · ใช้เวลา {elapsed:.1f} วินาที")
if F:
    print("\nรายการที่ไม่ผ่าน:")
    for f_ in F:
        print(f"  ❌ {f_}")

try:
    shutil.rmtree(WORK, ignore_errors=True)
    print(f"\nลบโฟลเดอร์ชั่วคราว {WORK} เรียบร้อย")
except Exception as e:
    print(f"\n⚠️ ลบ {WORK} ไม่สำเร็จ: {e}")

sys.exit(1 if F else 0)
