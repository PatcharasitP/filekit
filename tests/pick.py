#!/usr/bin/env python3
"""เลือกชุดเทสจากไฟล์ที่แก้ ตามกติกาที่พี่ปอนด์เคาะ 26/09/2026

‼️ ที่มา: รันชุดเต็ม 131 ชุด (45 ถึง 60 นาที) ทุกครั้งที่ปล่อย ทั้งที่บางรอบแก้คำค้นคำเดียว
   วันนั้นรันชุดเต็ม 3 รอบ ผ่านหมดทุกรอบ บั๊กจริงเจอจากเทสเฉพาะจุดกับการเปิดดูด้วยตาทั้งหมด
   กติกา: ① แก้เฉพาะจุด = เทส node ทั้งหมด + เทสเบราว์เซอร์ของส่วนที่แก้ ② แก้ไฟล์กลาง = ชุดเต็ม
   ③ ให้สคริปต์นี้ตัดสินจากไฟล์ที่แก้ ไม่ใช่ความจำ ไม่แน่ใจ = ชุดเต็มเสมอ

ใช้: python3 tests/pick.py [--range A B] [--explain]
     พิมพ์รายชื่อชุดคั่นด้วยช่องว่าง หรือคำว่า all (runp.sh changed เรียกตัวนี้)
ไฟล์ที่แก้ = commit ที่ยังไม่ขึ้น origin/main + ของที่ยังไม่ commit + ไฟล์ใหม่ที่ยังไม่ track
เทส: node tests/pick.test.mjs (commit จริงในประวัติ + ไฟล์กลางทีละตัว)
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("FK_ROOT") or Path(__file__).resolve().parent.parent)

# ไฟล์กลาง แก้แล้วกระทบทุกเครื่องมือหรือ FlowKit = ชุดเต็ม
CORE = {
    "src/app.js", "src/ui.js", "src/shell2.js", "src/dom.js", "src/workspace.js", "src/loader.js",
    "src/i18n.js", "src/handoff.js", "src/inapp.js", "src/icons.js", "src/registry.js", "src/offline.js",
    "src/preview.js", "src/filetype.js", "src/cfgsearch.js",
    "index.html", "manifest.webmanifest",
    "tests/runp.sh", "tests/fkui.py", "tests/gzip_server.py", "tests/contract.sh", "tests/pick.py",
}
CORE_PREFIX = ("assets/", "vendor/", "tests/lib/")
# ของที่ไม่มีโค้ดวิ่ง เทส node ครอบแล้ว (readme.test, accepts.test ตรวจ sitemap)
DOCS = {"README.md", "tests/README.md", "robots.txt", "sitemap.xml", ".gitignore", ".nojekyll"}
# ไฟล์ที่ชื่อเครื่องมือหาเทสไม่เจอ เพราะไม่มีเครื่องมือไหน import ตรง ๆ
SPECIAL = {
    "src/search.js": ["browser_findability", "browser_ux", "browser_perfbudget"],
    "src/registry-keys.js": ["browser_findability", "browser_ux", "browser_perfbudget"],
    "src/registry-en.js": ["browser_lang", "browser_i18n_deep", "browser_perfbudget"],
    "go/": ["browser_golink"],
}
MAX_TOOLS = 8          # โมดูลที่เครื่องมือเกินนี้ใช้ร่วมกัน ถือเป็นไฟล์กลาง
ALWAYS = ["css_contract"]
VERSION_LINE = re.compile(r'^[+-]const VERSION = "filekit-v\d+";$')
IMPORT_RE = re.compile(r"""(?:from\s+|import\s*\(\s*)["'](\.{1,2}/[^"']+\.js)["']""")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout


def changed_files(rng):
    if rng:
        return sorted(set(git("diff", "--name-only", rng[0], rng[1]).split()))
    files = set(git("diff", "--name-only", "origin/main...HEAD").split())
    files |= set(git("diff", "--name-only", "HEAD").split())
    files |= set(git("ls-files", "--others", "--exclude-standard").split())
    return sorted(files)


def sw_version_only(rng):
    if rng and rng[0] == "--no-diff--":
        return False
    diff = git("diff", "-U0", *(rng if rng else ["HEAD"]), "--", "sw.js")
    if not rng:
        diff += git("diff", "-U0", "origin/main...HEAD", "--", "sw.js")
    lines = [ln for ln in diff.splitlines() if ln[:1] in "+-" and not ln.startswith(("+++", "---"))]
    return bool(lines) and all(VERSION_LINE.match(ln) for ln in lines)


def importers():
    """โมดูล -> ไฟล์ที่ import มันตรง ๆ (ภายใน src)"""
    rev = {}
    for f in (ROOT / "src").rglob("*.js"):
        rel = f.relative_to(ROOT).as_posix()
        for m in IMPORT_RE.finditer(f.read_text(encoding="utf-8", errors="ignore")):
            tgt = (f.parent / m.group(1)).resolve()
            try:
                t = tgt.relative_to(ROOT).as_posix()
            except ValueError:
                continue
            rev.setdefault(t, set()).add(rel)
    return rev


def users_of(mod, rev):
    """ไฟล์ทั้งหมดที่ใช้ mod ทั้งตรงและผ่านโมดูลอื่น"""
    seen, stack = set(), [mod]
    while stack:
        for u in rev.get(stack.pop(), ()):
            if u not in seen:
                seen.add(u)
                stack.append(u)
    return seen


def tests_mentioning(words):
    out = set()
    pats = [re.compile(r"(?<![\w-])" + re.escape(w) + r"(?![\w-])") for w in words]
    for t in (ROOT / "tests").glob("browser_*.py"):
        text = t.read_text(encoding="utf-8", errors="ignore")
        if any(p.search(text) for p in pats):
            out.add(t.stem)
    return out


def decide(files, rng=None):
    """คืน ("all" | "quick", ชุดเทสที่เลือก, เหตุผล)"""
    why, suites = [], set()
    if not files:
        return "quick", [], ["ไม่มีไฟล์เปลี่ยน"]
    rev = None
    for f in files:
        if f == "sw.js":
            if sw_version_only(rng):
                why.append("sw.js แก้แค่เลขเวอร์ชัน ไม่นับเป็นไฟล์กลาง")
                continue
            return "all", [], [f"{f} แก้มากกว่าเลขเวอร์ชัน = ไฟล์กลาง"]
        if f in CORE or f.startswith(CORE_PREFIX):
            return "all", [], [f"{f} เป็นไฟล์กลาง"]
        if f in DOCS:
            why.append(f"{f} ไม่มีโค้ดวิ่ง เทส node ครอบ")
            continue
        if f in SPECIAL or any(f.startswith(k) for k in SPECIAL if k.endswith("/")):
            key = f if f in SPECIAL else next(k for k in SPECIAL if k.endswith("/") and f.startswith(k))
            suites |= set(SPECIAL[key])
            why.append(f"{f} ใช้ชุด {', '.join(SPECIAL[key])}")
            continue
        m = re.fullmatch(r"tests/(browser_\w+)\.py", f)
        if m:
            suites.add(m.group(1))
            why.append(f"{f} รันตัวมันเอง")
            continue
        if re.fullmatch(r"tests/[\w-]+\.test\.mjs", f):
            why.append(f"{f} เทส node รันทุกครั้งอยู่แล้ว")
            continue
        m = re.fullmatch(r"src/tools/([\w-]+)\.js", f)
        if m:
            found = tests_mentioning([m.group(1)])
            suites |= found
            why.append(f"{f} เครื่องมือ {m.group(1)} ใช้ชุด {', '.join(sorted(found)) or '(ไม่มีเทสเบราว์เซอร์ที่พูดถึง)'}")
            continue
        if re.fullmatch(r"src/[\w-]+\.js", f):
            rev = rev or importers()
            users = users_of(f, rev)
            if users & CORE:
                return "all", [], [f"{f} ถูกไฟล์กลาง {sorted(users & CORE)[0]} ใช้"]
            tools = sorted(Path(u).stem for u in users if u.startswith("src/tools/"))
            if len(tools) > MAX_TOOLS:
                return "all", [], [f"{f} ใช้ร่วม {len(tools)} เครื่องมือ (เกิน {MAX_TOOLS}) = ไฟล์กลาง"]
            found = tests_mentioning(tools + [Path(f).name])
            suites |= found
            why.append(f"{f} ใช้โดย {', '.join(tools) or '(ไม่มีเครื่องมือ)'} ใช้ชุด {', '.join(sorted(found)) or '-'}")
            continue
        if f.startswith("tests/fixtures/"):
            found = tests_mentioning([Path(f).name])
            suites |= found
            why.append(f"{f} ไฟล์ทดสอบ ใช้ชุด {', '.join(sorted(found)) or '(เทส node ครอบ)'}")
            continue
        if f.startswith("samples/"):
            found = tests_mentioning([Path(f).name])
            suites |= found
            why.append(f"{f} ไฟล์ตัวอย่าง ใช้ชุด {', '.join(sorted(found)) or '(samples.test ครอบ)'}")
            continue
        return "all", [], [f"{f} ไม่รู้จักไฟล์นี้ ไม่แน่ใจ = ชุดเต็ม"]
    # แก้โค้ดใน src เมื่อไร เปิดทุกเครื่องมือดูว่ายังขึ้นหน้าได้ ไม่มี error (browser_smoke ราว 2 นาที)
    if any(f.startswith(("src/", "samples/")) for f in files):
        suites.add("browser_smoke")
        why.append("มีการแก้ใน src หรือ samples เปิดทุกเครื่องมือด้วย browser_smoke")
    nodes = sorted(p.name for p in (ROOT / "tests").glob("*.test.mjs"))
    return "quick", sorted(suites) + ALWAYS + nodes, why


def main():
    if "--check-sw" in sys.argv:          # ใช้ในเทส: sw.js ใน commit นั้นแก้แค่เลขเวอร์ชันไหม
        i = sys.argv.index("--check-sw")
        print("true" if sw_version_only(sys.argv[i + 1:i + 3]) else "false")
        return
    rng = None
    if "--range" in sys.argv:
        i = sys.argv.index("--range")
        rng = sys.argv[i + 1:i + 3]
    if "--files" in sys.argv:             # ใช้ในเทส: ส่งรายชื่อไฟล์ตรง ๆ (sw.js ที่ส่งแบบนี้ถือเป็นไฟล์กลาง เพราะไม่มี diff ให้ดู)
        files = [f for f in sys.argv[sys.argv.index("--files") + 1:] if not f.startswith("--")]
        rng = ["--no-diff--", "--no-diff--"]
    else:
        files = changed_files(rng)
    tier, suites, why = decide(files, rng)
    if "--explain" in sys.argv:
        print(f"ไฟล์ที่แก้ {len(files)}: {' '.join(files) or '-'}", file=sys.stderr)
        for w in why:
            print("  " + w, file=sys.stderr)
        print(f"ตัดสิน: {'ชุดเต็ม' if tier == 'all' else 'เฉพาะที่เกี่ยว ' + str(len(suites)) + ' ชุด'}", file=sys.stderr)
    print("all" if tier == "all" else " ".join(suites))


if __name__ == "__main__":
    main()
