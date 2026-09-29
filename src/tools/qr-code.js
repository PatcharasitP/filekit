// ── สร้าง QR ──────────────────────────────────────────────────────────────────
// เคสจริง: ติดลิงก์แบบฟอร์มบนสไลด์ ใบประกาศ หรือหน้าห้องประชุม
// เว็บสร้าง QR ฟรีส่วนใหญ่ส่งลิงก์ผ่านบริการย่อลิงก์ของตัวเองเพื่อเก็บสถิติ แล้ว QR ตายเมื่อหมดช่วงฟรี
// ที่นี่ใส่ข้อความตรง ๆ ลง QR สร้างในเครื่อง ไม่มีวันหมดอายุ
//
// ‼️ ข้อความไทยต้องเข้ารหัส UTF-8 (src/qr.js ตั้งให้) ค่าเริ่มต้นของไลบรารีทำไทยเพี้ยน พิสูจน์ใน tests/qr.test.mjs
import { el, dropzone, statusBar, button, field, select, segmented, download } from "../ui.js";
import { workspace } from "../workspace.js";
import { loadLibs } from "../loader.js";
import { makeQr, drawQr, qrToSvg, QrTooLong } from "../qr.js";
import { colorPicker, contrast, luminance, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { tr, pl } from "../i18n.js";

/* ‼️ กล้องมือถือต้องการจุดเข้มบนพื้นอ่อนและความต่างพอ เกณฑ์ 4 เป็นตัวเลขที่ใช้กันทั่วไป ยังไม่ได้พิสูจน์กับกล้องจริง */
const MIN_CONTRAST = 4;

const STYLE = `
${COLORKIT_CSS}
.qr-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.qr-ta{flex:0 0 auto;min-height:96px;height:120px;width:100%;resize:vertical;font-family:inherit;font-size:14px;
  line-height:1.6;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--card);color:var(--text)}
.qr-ta:focus-visible{outline:2px solid var(--g-img);outline-offset:1px}
.qr-sum{font-size:13.5px;color:var(--text-mute);font-variant-numeric:tabular-nums}
.qr-box{flex:1 1 auto;min-height:220px;display:flex;align-items:center;justify-content:center;
  border:1px solid var(--line-soft);border-radius:var(--r-sm);background:var(--bg-soft);padding:14px}
.qr-box canvas{width:min(100%,300px);height:auto;aspect-ratio:1;image-rendering:pixelated;
  border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.qr-empty{font-size:13px;color:var(--text-mute);text-align:center}
.qr-warn{font-size:12.5px;line-height:1.55;color:color-mix(in srgb,var(--err) 80%,var(--text));margin-top:8px}
.qr-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px;margin-top:12px}
`;

const fmt = (n) => n.toLocaleString(tr("th-TH", "en-US"));

export function mount(tool) {
  const st = statusBar();
  let lib = null;
  let last = null;       // { qr, px } ของ QR ที่วาดล่าสุด
  let fg = "#000000", bg = "#ffffff";

  const ta = el("textarea", { class: "qr-ta", spellcheck: "false",
    "aria-label": tr("ข้อความหรือลิงก์ที่จะใส่ใน QR", "Text or link to put in the QR code"),
    placeholder: tr("วางลิงก์ หรือพิมพ์ข้อความที่อยากให้สแกนแล้วเห็น", "Paste a link, or type the text people should see when they scan") });
  const canvas = el("canvas", { role: "img", "aria-label": tr("ตัวอย่าง QR", "QR code preview") });
  const empty = el("div", { class: "qr-empty" }, tr("QR จะขึ้นตรงนี้ทันทีที่พิมพ์", "The QR code appears here as you type"));
  const box = el("div", { class: "qr-box" }, [empty, canvas]);
  const sum = el("div", { class: "qr-sum", role: "status", "aria-live": "polite" });
  const wrap = el("div", { class: "qr-wrap" }, [ta, sum, box]);

  const level = segmented([["L", "7%"], ["M", "15%"], ["Q", "25%"], ["H", "30%"]], "M");
  const size = select([["512", "512 px"], ["1024", tr("1024 px (พิมพ์ได้คม)", "1024 px (sharp in print)")],
    ["2048", "2048 px"]], "1024");
  const warn = el("div", { class: "qr-warn", role: "alert", hidden: true });
  const fgPick = colorPicker(fg, (hex) => { fg = hex; render(); },
    { swatches: SWATCHES.neutral.slice(4).concat(SWATCHES.accent.slice(0, 4)), label: tr("สีจุด", "Dot colour") });
  const bgPick = colorPicker(bg, (hex) => { bg = hex; render(); },
    { swatches: SWATCHES.neutral.slice(0, 4), label: tr("สีพื้น", "Background colour") });
  level.onchange = () => render();
  size.onchange = () => render();

  const opts = el("div", {}, [
    field(tr("ทนรอยเปื้อนได้", "Damage tolerance"), level,
      tr("ยิ่งสูงยิ่งทนรอยเปื้อนหรือรอยพับ แต่จุดแน่นขึ้น", "Higher survives smudges and folds, but the dots get denser")),
    field(tr("ขนาดภาพ PNG", "PNG size"), size),
    field(tr("สีจุด", "Dot colour"), fgPick.node),
    field(tr("สีพื้น", "Background colour"), bgPick.node),
    warn,
    el("div", { class: "qr-note" }, tr("ข้อความลงใน QR ตรง ๆ ไม่ผ่านบริการย่อลิงก์ จึงไม่หมดอายุและไม่มีใครเก็บสถิติการสแกน",
      "The text goes straight into the code with no link shortener, so it never expires and no one tracks scans")),
  ]);

  const pngBtn = button(tr("ดาวน์โหลด PNG", "Download PNG"), { onclick: () => save("png") });
  const svgBtn = button(tr("ดาวน์โหลด SVG", "Download SVG"), { ghost: true, onclick: () => save("svg") });
  const clearBtn = button(tr("ล้างข้อความ", "Clear"), { ghost: true, onclick: () => { ta.value = ""; render(); ta.focus(); } });

  const dz = dropzone({
    accept: ".txt,text/plain", multiple: false,
    expect: ["txt"], expectLabel: tr("ไฟล์ข้อความ (.txt)", "a text file (.txt)"),
    hint: tr("ไม่ใส่ไฟล์ก็ได้ พิมพ์หรือวางในช่องกลางได้เลย", "A file is optional, you can just type or paste in the middle"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ข้อความ (ถ้ามี)", "Text file (optional)"), node: dz.container },
    right: { title: tr("ตั้งค่า QR", "QR settings"), node: opts },
    center: { node: wrap },
    footer: [pngBtn, svgBtn, clearBtn, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.showCanvas(true);

  let timer = 0;
  ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 150); });

  function colorWarning() {
    const ratio = contrast(fg, bg);
    if (ratio === null) return "";
    if (luminance(fg) > luminance(bg))
      return tr("จุดสีอ่อนบนพื้นเข้ม กล้องหลายรุ่นอ่านไม่ออก ใช้จุดเข้มบนพื้นอ่อนจะชัวร์กว่า",
                "Light dots on a dark background fail on many phone cameras, use dark dots on light");
    if (ratio < MIN_CONTRAST)
      return tr(`สีจุดกับสีพื้นต่างกันแค่ ${ratio.toFixed(1)} กล้องบางรุ่นอ่านไม่ออก ควรได้ ${MIN_CONTRAST} ขึ้นไป`,
                `Dot and background contrast is only ${ratio.toFixed(1)}, some cameras will fail, aim for ${MIN_CONTRAST} or more`);
    return "";
  }

  async function render() {
    const text = ta.value;
    const w = colorWarning();
    warn.hidden = !w;
    warn.textContent = w;
    st.clear();
    last = null;
    const has = text.length > 0;
    pngBtn.disabled = svgBtn.disabled = !has;
    canvas.hidden = !has;
    empty.hidden = has;
    if (!has) { sum.textContent = ""; return; }
    try {
      if (!lib) [lib] = await loadLibs("qrcode");
      if (ta.value !== text) return;                       // พิมพ์ต่อระหว่างรอโหลดไลบรารี รอบถัดไปจะวาดเอง
      const qr = makeQr(lib, text, level.value);
      const px = drawQr(canvas, qr, { size: +size.value, fg, bg });
      last = { qr, px };
      const bytes = new TextEncoder().encode(text).length;
      sum.textContent = tr(`QR ${qr.n} x ${qr.n} ช่อง, ภาพ ${fmt(px)} x ${fmt(px)} พิกเซล, ข้อความ ${fmt(bytes)} ไบต์`,
        `QR ${qr.n} x ${qr.n} modules, image ${fmt(px)} x ${fmt(px)} px, text ${pl(fmt(bytes), "byte", "bytes")}`);
    } catch (e) {
      canvas.hidden = true;
      empty.hidden = false;
      pngBtn.disabled = svgBtn.disabled = true;
      sum.textContent = "";
      if (e instanceof QrTooLong) {
        st.err(tr("ข้อความยาวเกิน QR จะรับได้ ภาษาไทยได้ราว 980 ตัว อังกฤษราว 2,900 ตัว ที่ระดับ 7%",
                  "Too long for a QR code, about 2,900 English characters fit at the 7% level"));
      } else {
        st.err(tr("สร้าง QR ไม่สำเร็จ: ", "Couldn't make the QR code: ") + e.message);
      }
    }
  }

  function save(kind) {
    if (!last) return;
    if (kind === "svg") {
      download(new Blob([qrToSvg(last.qr, { fg, bg })], { type: "image/svg+xml" }), "qr-code.svg");
      st.ok(tr("ดาวน์โหลด SVG แล้ว ขยายเท่าไรก็คม", "SVG downloaded, it stays sharp at any size"));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return st.err(tr("ทำไฟล์ PNG ไม่สำเร็จ", "Couldn't make the PNG"));
      download(blob, "qr-code.png");
      st.ok(tr(`ดาวน์โหลด PNG ${fmt(last.px)} พิกเซลแล้ว`, `Downloaded a ${fmt(last.px)} px PNG`));
    }, "image/png");
  }

  async function onFile(fs) {
    const f = fs[0];
    st.clear();
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) {
        try { text = new TextDecoder("windows-874").decode(buf); } catch { /* เบราว์เซอร์ไม่รู้จักก็ใช้ของเดิม */ }
      }
      ta.value = text.replace(/\s+$/, "");
      await render();
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่ได้: ", "Couldn't read the file: ") + e.message);
    }
  }

  render();
  return ws.wrap;
}
