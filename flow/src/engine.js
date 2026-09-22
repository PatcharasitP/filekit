// ─────────────────────────────────────────────────────────────────────────────
// สะพานไป draw.io ตัวฝัง (แผน D3) คุยด้วย postMessage อย่างเดียว ไม่แก้โค้ดของเขาสักบรรทัด
//
// ท่อหนึ่งรอบ (ยิงจริง 22/09/2026 หลักฐาน .claude/evidence/flowkit-build-2026-09-22/engine_probe*.py)
//   1. load Mermaid → event load ส่ง xml กลับมาด้วยเลย และแปลงเสร็จแล้วจริง
//      (ส่งออกทันทีกับรอ 2.2 วินาทีได้กล่อง เส้น และขนาดภาพเท่ากันทุกตัวเลข)
//   2. เปลี่ยนฟอนต์ใน xml เป็น Sarabun แล้ว load กลับ (เฟส 0 ข้อ จ: configure ไม่มีผลกับผังจาก Mermaid)
//   3. export xmlpng = PNG ที่ฝัง XML ไว้ ไฟล์เดียววางสไลด์ได้ และเปิดแก้ต่อใน draw.io ได้ (D4)
//   ใช้ iframe เดิมซ้ำได้ ผังเก่าหายหมด · เปิดครั้งแรก ~2 วินาที รอบถัดไป 65 ถึง 150 ms
//
// ‼️ Mermaid ที่พังบางแบบ draw.io ยังตอบ load พร้อมผังที่ขาดกล่อง บางแบบเงียบไปเลย
//    จึงนับกล่องใน xml เทียบกับที่สั่ง และทุกขั้นมีเพดานเวลา
// ‼️ draw.io ส่งคำขอของเรากลับมาในช่อง message ของ event จึงติดเลขลำดับไว้ให้ event ตอบคำขอถูกตัว
//    แต่ load ที่ส่ง xml ไป ไม่มีช่องนี้กลับมา (จับ event จริง 22/09/2026 เคยรอจนหมดเวลาเพราะเทียบเลขอย่างเดียว)
//    event ที่ไม่มีเลขจึงรับได้ ส่วนกันของค้างจากคำขอเก่า ใช้วิธีทิ้ง iframe ทั้งตัวทุกครั้งที่หมดเวลาแทน
// ─────────────────────────────────────────────────────────────────────────────

/* ‼️ W1 (พี่ปอนด์เคาะ 22/09/2026) ใช้ของเขาก่อน สลับเป็นวางเองได้ที่บรรทัดนี้บรรทัดเดียว
 *    วางเอง = "../vendor/drawio/" แล้วแก้ CSP ใน flow/index.html จาก frame-src https://embed.diagrams.net เป็น 'self'
 * ‼️ ห้ามรับที่อยู่นี้จาก URL (?drawio=) ใครส่งลิงก์ที่ชี้ไปเว็บอื่นมา ข้อความที่พิมพ์จะถูกส่งไปให้เว็บนั้น */
export const DRAWIO = "https://embed.diagrams.net/";
const ORIGIN = new URL(DRAWIO, location.href).origin;
const PARAMS = "?embed=1&proto=json&spin=1&ui=min&noSaveBtn=1&noExitBtn=1";
const FONT_SOURCE = encodeURIComponent("https://fonts.googleapis.com/css?family=Sarabun");
/* ‼️ เวลาตัดสินว่า "ต่อไม่ได้" มาจากการวัดจริง 22/09/2026 (engine_probe4.py)
 *    เน็ตปกติ: iframe โหลดเสร็จที่ 0.4 ถึง 0.7 วินาที แล้ว draw.io ส่ง init ตามมาอีก 0.7 ถึง 1 วินาที
 *    โดเมนถูกบล็อก: iframe "โหลดเสร็จ" ใน 0.1 วินาที (เป็นหน้า error) แล้วไม่มี init มาเลย
 *    เน็ต 3G ช้า 400 kbps: 20 วินาทียังไม่โหลดเสร็จทั้งคู่ (draw.io หนักราว 10 MB)
 *    จึงนับเวลาจากตอน iframe โหลดเสร็จ ไม่ใช่จากตอนเริ่ม เน็ตช้าจะไม่ถูกตัดสินว่าต่อไม่ได้ทั้งที่กำลังโหลดอยู่
 *    และถึงจะบอกผู้ใช้ไปแล้วว่าต่อไม่ได้ ถ้า init มาทีหลังก็ยังรับ ผังขึ้นเองโดยไม่ต้องกดอะไร */
const BOOT_SLOW_MS = 8000;         // ยังไม่พร้อม บอกผู้ใช้ว่าครั้งแรกต้องโหลดตัววาดผังก่อน
const AFTER_LOAD_MS = 10000;       // iframe โหลดเสร็จแล้วยังไม่มี init = น่าจะถูกบล็อกหรือเว็บเขาล่ม
const STEP_MAX_MS = 15000;         // Mermaid ที่ draw.io อ่านไม่ออกเลยจะเงียบ ไม่มี event ใดกลับมา

export class EngineError extends Error {
  /** @param {"timeout"|"incomplete"|"bad-png"|"reset"} kind */
  constructor(kind, detail = "") { super(detail || kind); this.kind = kind; }
}

/** ฟอนต์ของทุกกล่องและเส้นเป็น Sarabun
 *  แก้เฉพาะในแอตทริบิวต์ style กับ mermaidBaseStyle (ข้อความที่ผู้ใช้พิมพ์ว่า fontFamily=... ต้องไม่ถูกแตะ)
 *  ‼️ mermaidBaseStyle คือสไตล์ตั้งต้นที่ draw.io จำไว้ตอนแปลงจาก Mermaid (เจอจากการแกะ PNG จริง 22/09/2026)
 *     ไม่แก้ตรงนี้ด้วย แก้กล่องใน draw.io ทีหลังแล้วฟอนต์อาจเด้งกลับเป็น Trebuchet */
export function restyleFont(xml) {
  const font = `fontFamily=Sarabun;fontSource=${FONT_SOURCE}`;
  return String(xml).replace(/(\s(?:style|mermaidBaseStyle))="([^"]*)"/g, (_, attr, s) =>
    `${attr}="${/fontFamily=/.test(s) ? s.replace(/fontFamily=[^;]*/g, font) : `${s}${s && !s.endsWith(";") ? ";" : ""}${font};`}"`);
}

/** จำนวนกล่อง (รวมกรอบกลุ่ม) ใน xml ของ draw.io */
export const countVertices = (xml) => (String(xml).match(/vertex="1"/g) || []).length;

function pngBlob(uri) {
  const head = "data:image/png;base64,";
  if (typeof uri !== "string" || !uri.startsWith(head)) throw new EngineError("bad-png");
  const bin = atob(uri.slice(head.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/**
 * @param {{ onState?: (s: "booting"|"slow"|"ready"|"unreachable"|"offline") => void }} opts
 * @returns {{ render(mermaid: string, expectBoxes?: number): Promise<{png: Blob, xml: string} | {stale: true}>, retry(): void, boot(): Promise<void> }}
 */
export function createEngine({ onState = () => {} } = {}) {
  let frame = null, boot$ = null, ready = false, seq = 0;
  let running = false, queued = null;          // วาดทีละใบ ใบที่รอคิวเก็บแค่ใบล่าสุด (พิมพ์รัว ๆ ไม่ต้องวาดทุกตัวอักษร)
  const waiters = new Set();

  window.addEventListener("message", (ev) => {
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== ORIGIN || typeof ev.data !== "string") return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || typeof m.event !== "string") return;
    const tag = m.message && m.message.fk;
    for (const w of waiters) if (w.event === m.event && (w.tag == null || tag == null || w.tag === tag)) { waiters.delete(w); w.done(m); }
  });

  /** รอ event ชื่อนี้ (ms = 0 คือรอได้เรื่อย ๆ จนกว่าจะ reset) */
  function wait(event, tag, ms) {
    return new Promise((resolve, reject) => {
      const w = { event, tag, done: (m) => { clearTimeout(t); resolve(m); }, fail: (e) => { clearTimeout(t); reject(e); } };
      const t = ms ? setTimeout(() => { waiters.delete(w); reject(new EngineError("timeout", event)); }, ms) : 0;
      waiters.add(w);
    });
  }
  function call(msg, event) {
    const tag = ++seq;
    const p = wait(event, tag, STEP_MAX_MS);
    frame.contentWindow.postMessage(JSON.stringify({ ...msg, fk: tag }), ORIGIN);
    return p;
  }

  function boot() {
    if (boot$) return boot$;
    const f = document.createElement("iframe");
    frame = f; ready = false;
    f.className = "fk-engine";
    f.title = "draw.io";
    f.tabIndex = -1;
    f.inert = true;                            // ‼️ ซ่อนแบบยังวาดอยู่ ไม่ใช่ display:none (Chrome หน่วง iframe ต่างโดเมนที่ถูกซ่อน)
    f.setAttribute("aria-hidden", "true");
    onState(navigator.onLine === false ? "offline" : "booting");
    const alive = () => frame === f && !ready;
    const slow = setTimeout(() => { if (alive() && navigator.onLine !== false) onState("slow"); }, BOOT_SLOW_MS);
    let dead = 0;
    f.addEventListener("load", () => {
      clearTimeout(dead);
      dead = setTimeout(() => { if (alive()) onState(navigator.onLine === false ? "offline" : "unreachable"); }, AFTER_LOAD_MS);
    });
    boot$ = wait("init", null, 0).then(() => {
      clearTimeout(slow); clearTimeout(dead);
      ready = true; onState("ready");
    });
    boot$.catch(() => {});                     // คนรอจริงคือ drawOnce ตัวนี้แค่กันเตือน unhandled
    f.src = DRAWIO + PARAMS;
    document.body.appendChild(f);
    return boot$;
  }

  /** ทิ้ง iframe ทั้งตัว คำขอที่ค้างอยู่ทุกตัวจบด้วย reset (event ค้างจาก iframe เก่าถูกกรองทิ้งเองเพราะ ev.source ไม่ตรง) */
  function reset() {
    if (frame) frame.remove();
    frame = null; boot$ = null; ready = false;
    for (const w of [...waiters]) { waiters.delete(w); w.fail(new EngineError("reset")); }
  }

  async function drawOnce(mermaid, expectBoxes) {
    await boot();
    const first = await call({ action: "load", autosave: 0, descriptor: { format: "mermaid", data: mermaid } }, "load");
    const got = countVertices(first.xml);
    if (expectBoxes && got < expectBoxes) throw new EngineError("incomplete", `${got}/${expectBoxes}`);
    const xml = restyleFont(first.xml);
    await call({ action: "load", autosave: 0, xml }, "load");
    const out = await call({ action: "export", format: "xmlpng", scale: 2, border: 16, background: "#ffffff" }, "export");
    return { png: pngBlob(out.data), xml: out.xml || xml };
  }

  async function pump() {
    while (queued) {
      const job = queued; queued = null;
      running = true;
      try { job.resolve(await drawOnce(job.mermaid, job.expectBoxes)); }
      catch (e) { if (e && e.kind === "timeout") reset(); job.reject(e); }
      finally { running = false; }
    }
  }

  return {
    render(mermaid, expectBoxes = 0) {
      return new Promise((resolve, reject) => {
        if (queued) queued.resolve({ stale: true });
        queued = { mermaid, expectBoxes, resolve, reject };
        if (!running) pump();
      });
    },
    /** เริ่มใหม่ทั้งตัว (ปุ่มลองใหม่ หรือเน็ตกลับมา) งานที่ค้างรอ iframe ตัวเก่าจบด้วย reset ไม่ค้างคิว */
    retry() { reset(); boot(); },
    boot,
  };
}
