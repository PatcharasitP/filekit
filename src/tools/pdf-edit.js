// ── แก้ไขข้อความบน PDF ─────────────────────────────────────────────────────
// โจทย์จริงจากพี่ปอนด์ 18/09/2026 "ต้องการลบวันที่ใน PDF แล้วพิมพ์อีกวันที่แทน"
// เป็นงานที่เจอบ่อยมากกับสัญญาและเอกสารราชการ ที่ได้ไฟล์มาแล้วต้องแก้นิดเดียว
// แต่ไม่มีไฟล์ต้นฉบับ Word จึงต้องเปิดโปรแกรมแพง ๆ หรือพิมพ์ออกมาแล้วเขียนมือ
//
// ‼️ ทำไมเป็น "ปิดทับแล้วพิมพ์ใหม่" ไม่ใช่แก้ตัวอักษรในไฟล์จริง
//    ข้อความใน PDF ไม่ได้เก็บเป็นบรรทัดให้แก้ได้ แต่เป็นคำสั่งวาดทีละชิ้น
//    พร้อมพิกัดและระยะห่างที่คำนวณไว้แล้ว แก้ตัวอักษรตรง ๆ จึงทำให้ทั้งย่อหน้าเพี้ยน
//    เครื่องมือระดับโลกอย่าง iLovePDF ก็ใช้วิธีวางกล่องทับเหมือนกัน (ดูของจริงแล้ว)
//
// ‼️ ภาษาไทยไม่ต้องโหลดไลบรารีเพิ่ม
//    pdf-lib ฝังฟอนต์ไทยเองไม่ได้ถ้าไม่มี fontkit ซึ่งเราไม่โหลดเพราะหนัก
//    จึงใช้วิธีเดียวกับใส่เลขหน้าและลายน้ำ คือวาดข้อความลง canvas แล้วฝังเป็น PNG
//    ได้ภาษาไทยครบทุกตัวรวมสระและวรรณยุกต์ โดยไม่เพิ่มขนาดที่ต้องโหลด
import { loadPdfLib, ENCRYPTED_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes, keyHints} from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { signaturePad, savedSignatures, saveSignature, removeSignature,
         imageToSignature } from "../signpad.js";
import { tr, pl } from "../i18n.js";

const VIEW_SCALE = 1.6;    // ความละเอียดที่เรนเดอร์หน้ามาให้ดู ยิ่งสูงยิ่งวางตำแหน่งแม่น
/* ‼️ ต้องซูมได้ เพราะข้อความในสัญญาจริงตัวเล็กมาก (พี่ปอนด์ขอเอง 18/09/2026)
   ถ้าเห็นหน้าเต็มพอดีจอ ตัวอักษรจะสูงไม่ถึงสิบพิกเซล ลากคลุมให้พอดีคำแทบเป็นไปไม่ได้
   ระดับซูมคูณกับความกว้างที่แสดง ส่วนกล่องที่วางไว้เก็บเป็นสัดส่วนอยู่แล้วจึงตามไปเอง */
const ZOOMS = [0.75, 1, 1.5, 2, 3];
const PNG_SCALE = 4;       // ความละเอียดของข้อความที่ฝังลงไฟล์ ต้องสูงกว่าจอไม่งั้นเบลอ

/* วาดข้อความลง canvas แล้วคืนเป็น PNG พร้อมขนาดจริงเป็นหน่วยของ PDF
   ‼️ ต้องเผื่อความสูงให้สระบนกับวรรณยุกต์ไทย ไม่งั้นโดนตัดหัว
      ใช้ 1.7 เท่าของขนาดตัวอักษร ซึ่งวัดจากข้อความที่มีของยากครบแล้ว */
function textToPng(text, { fontSize, color, weight = 400 }) {
  const font = `${weight} ${fontSize * PNG_SCALE}px "FK Sarabun","Sarabun","Noto Sans Thai",sans-serif`;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 6;
  const h = Math.ceil(fontSize * PNG_SCALE * 1.7);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(w, 2);
  canvas.height = Math.max(h, 2);
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 3, h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), w: w / PNG_SCALE, h: h / PNG_SCALE };
}

const hexToRgb01 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

const STYLE = `
.pe-left,.pe-right{display:flex;flex-direction:column;gap:10px}
.pe-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:7px;
  max-height:330px;overflow:auto;padding:2px}
.pe-thumb{position:relative;border:2px solid var(--line-soft);border-radius:7px;overflow:hidden;
  cursor:pointer;background:#fff;padding:0;line-height:0}
.pe-thumb img{width:100%;height:auto;display:block}
.pe-thumb.on{border-color:var(--brand)}
.pe-thumb b{position:absolute;inset-block-end:2px;inset-inline-end:3px;font-size:10px;
  background:rgba(0,0,0,.6);color:#fff;border-radius:4px;padding:0 4px;line-height:15px;font-weight:700}
.pe-thumb .dot{position:absolute;inset-block-start:3px;inset-inline-start:3px;width:8px;height:8px;
  border-radius:50%;background:var(--brand);box-shadow:0 0 0 2px #fff}

/* เวทีแก้ไข หน้ากระดาษกับชั้นวาดทับต้องซ้อนกันพอดีเป๊ะ ไม่งั้นตำแหน่งเพี้ยน */
/* ‼️ เวทีต้องสูงเท่าหน้ากระดาษเป๊ะ ห้ามถูกบีบ (เจอจริง 18/09/2026)
   กล่องกลางเป็น flex column ที่มีเพดานความสูง เวทีจึงโดนหดจาก 954 เหลือ 631
   แต่ภาพข้างในยังสูง 954 ตามเดิม ผลคือชั้นวาดทับซึ่งอิงขนาดเวที เตี้ยกว่าภาพ 34%
   พิกัดที่คำนวณจากชั้นนั้นจึงเพี้ยนทั้งหมด ข้อความที่วางออกมาใหญ่กว่าที่เห็นบนจอ 53%
   flex:none บอกว่าอย่าหด แล้วปล่อยให้กล่องกลางเลื่อนแทน */
/* ‼️ ห้ามใส่ max-width:100% ที่เวที (เจอจริง 18/09/2026)
   เคยใส่ไว้ ผลคือกดซูมแล้วป้ายเปลี่ยนเป็น 200% แต่ภาพไม่ขยายสักนิด
   เพราะโดนเพดานความกว้างของกล่องแม่กดไว้ ซึ่งดูเผิน ๆ เหมือนปุ่มซูมเสีย
   ให้เวทีกว้างได้ตามที่สั่ง แล้วให้กล่องแม่เลื่อนแนวนอนแทน */
.pe-stage{position:relative;margin:0 auto;line-height:0;flex:none;
  box-shadow:var(--sh2);border-radius:4px;background:#fff}
/* ‼️ ต้อง align-items:start ไม่งั้นเวทีโดนยืดให้สูงเท่ากล่องเลื่อน
   ซึ่งเตี้ยกว่าหน้ากระดาษจริง แล้วชั้นวาดทับก็เตี้ยตาม พิกัดเพี้ยนเหมือนเดิมอีกรอบ
   เป็นกับดักเดียวกับที่เจอตอนแก้ flex:none ครั้งแรก แค่ย้ายมาอยู่ที่กล่องใหม่ */
.pe-scroll{overflow:auto;padding:10px;display:flex;justify-content:center;align-items:flex-start}
.pe-stage canvas{display:block;width:100%;height:auto}
.pe-layer{position:absolute;inset:0;cursor:crosshair}
.pe-layer.text-mode{cursor:text}
.pe-box{position:absolute;box-sizing:border-box;cursor:move;touch-action:none}
.pe-box.moving{opacity:.75}
/* มือจับมุมล่างขวา สำหรับปรับขนาดกล่องปิดทับ */
.pe-grip{position:absolute;inset-block-end:-6px;inset-inline-end:-6px;width:13px;height:13px;
  border-radius:3px;background:var(--brand);border:2px solid var(--bg);cursor:nwse-resize;
  opacity:0;transition:opacity .12s}
.pe-box:hover .pe-grip{opacity:1}
@media (hover:none){ .pe-grip{opacity:1} }
/* ‼️ กล่องปิดทับมักเป็นสีขาวเพื่อกลืนกับกระดาษ ซึ่งแปลว่าบนจอก็มองไม่เห็นเหมือนกัน
   ผู้ใช้จึงไม่รู้ว่าปิดไปตรงไหนบ้างและปิดครบหรือยัง
   จึงตีกรอบให้เห็นบนจอ แต่กรอบนี้อยู่แค่บนจอ ไม่ได้ติดลงไฟล์จริง */
.pe-box.cover{border:1.5px dashed var(--brand); box-shadow:inset 0 0 0 9999px transparent}
.pe-box.cover::before{content:""; position:absolute; inset:0; background:var(--brand); opacity:.10}
.pe-box.text{display:flex;align-items:center;white-space:pre;overflow:visible;
  font-family:"FK Sarabun","Sarabun","Noto Sans Thai",sans-serif;line-height:1.2}
/* ‼️ ปุ่มเอาออกโผล่เฉพาะตอนชี้หรือโฟกัส (18/09/2026)
   เดิมโผล่ตลอด พอวางของใกล้กันปุ่มจะซ้อนกันจนบังงานตัวเอง
   บนจอสัมผัสที่ไม่มีการชี้ ให้โผล่ตลอดเหมือนเดิม ไม่งั้นกดลบไม่ได้เลย */
.pe-box .rm{position:absolute;inset-block-start:-9px;inset-inline-end:-9px;width:18px;height:18px;
  border-radius:50%;border:0;background:var(--danger,#c0392b);color:#fff;font-size:11px;
  line-height:18px;text-align:center;cursor:pointer;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.4);
  opacity:0;transition:opacity .12s}
.pe-box:hover .rm,.pe-box .rm:focus-visible{opacity:1}
@media (hover:none){ .pe-box .rm{opacity:1} }
.pe-zoom{font-size:12.5px;font-weight:700;min-width:46px;text-align:center;
  color:var(--text-mute);font-variant-numeric:tabular-nums}
/* ── ของที่วางทับได้ นอกจากกล่องปิดทับกับข้อความ (เฟส 6 รวมเครื่องมือ 21/09/2026) ──
   ‼️ ไฮไลต์ต้อง "โปร่ง" จริงทั้งบนจอและในไฟล์ ไม่งั้นมันคือกล่องปิดทับที่เปลี่ยนสี
      ซึ่งจะกลืนข้อความข้างใต้หายไป = ตรงข้ามกับสิ่งที่คำว่าไฮไลต์สัญญาไว้ */
.pe-box.highlight{mix-blend-mode:multiply;border:1px dashed color-mix(in srgb,var(--brand) 55%,transparent)}
.pe-box.stamp{line-height:0}
.pe-box.stamp img{width:100%;height:auto;display:block;pointer-events:none}
.pe-sign{display:flex;flex-direction:column;gap:8px}
.pe-sign .sign-canvas{border:1px dashed var(--line);border-radius:var(--r-sm,10px);background:#fff;touch-action:none}
.pe-saved{display:flex;flex-wrap:wrap;gap:8px}
.pe-saved figure{position:relative;margin:0;border:1px solid var(--line);border-radius:8px;
  padding:4px 6px;background:#fff;cursor:pointer;line-height:0}
.pe-saved figure.on{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 25%,transparent)}
.pe-saved img{height:34px;width:auto;display:block}
.pe-saved .x{position:absolute;inset-block-start:-7px;inset-inline-end:-7px;width:17px;height:17px;
  border-radius:50%;border:0;background:var(--danger,#c0392b);color:#fff;font-size:10px;line-height:17px;
  padding:0;cursor:pointer}
.pe-grp[hidden]{display:none}
.pe-hint{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
`;

export function mount(tool) {
  const st = statusBar();
  const extra = el("div", {});
  const results = el("div", { class: "results" });
  const thumbs = el("div", { class: "pe-thumbs" });
  const stage = el("div", { class: "pe-stage", hidden: true });
  const viewCanvas = el("canvas", {});
  const layer = el("div", { class: "pe-layer" });
  stage.append(viewCanvas, layer);
  const scroller = el("div", { class: "pe-scroll" }, [stage]);

  let file = null;
  let pdf = null;            // เอกสารที่เปิดค้างไว้ ใช้เรนเดอร์หน้าที่เลือก
  let pageCount = 0;
  let cur = 0;               // หน้าที่กำลังแก้ เริ่มนับ 0
  let pageSize = null;       // ขนาดจริงของหน้าเป็นหน่วย PDF
  let edits = [];            // {page, kind:'cover'|'text', x,y,w,h, text,size,color,weight}
  let thumbData = [];
  let zoom = 1;            // ระดับซูมปัจจุบัน ดูค่าที่ใช้ได้ที่ ZOOMS
  let fitWidth = 0;        // ความกว้างที่ทำให้หน้าพอดีกล่องกลาง ใช้เป็นฐานของซูม 1 เท่า

  // ── เครื่องมือและค่าตั้ง ────────────────────────────────────────────────
  const modeSeg = segmentedModes();
  const textInput = el("input", { type: "text", placeholder: tr("พิมพ์ข้อความที่จะใส่", "Text to add") });
  const sizeSel = select([["10", "10"], ["12", "12"], ["14", "14"], ["16", "16"], ["18", "18"], ["22", "22"], ["28", "28"]], "14");
  const weightSel = select([["400", tr("ปกติ", "Regular")], ["700", tr("หนา", "Bold")]], "400");
  const textColor = el("input", { type: "color", value: "#000000" });
  const coverColor = el("input", { type: "color", value: "#ffffff" });
  const hlColor = el("input", { type: "color", value: "#ffe14d" });
  /* ‼️ ความกว้างของลายเซ็นกับรูป เก็บเป็นสัดส่วนของหน้า ไม่ใช่พิกเซล
     หน้ากระดาษบนจอย่อขยายได้ ถ้าเก็บเป็นพิกเซลของจอ ขนาดที่ได้ในไฟล์จะไม่ตรงกับที่เห็น */
  const stampSize = el("input", { type: "range", min: "5", max: "60", value: "22", step: "1" });
  const stampSizeVal = el("span", { class: "pe-zoom" }, "22%");
  stampSize.addEventListener("input", () => { stampSizeVal.textContent = stampSize.value + "%"; });

  let stampUrl = null;            // PNG พื้นโปร่งของลายเซ็นหรือรูปที่เลือกอยู่
  const pad = signaturePad({ onChange: () => { padUse.disabled = pad.isEmpty(); } });
  const padUse = button(tr("ใช้ลายเซ็นนี้", "Use this signature"), { onclick: () => {
    const url = pad.toDataURL();
    if (!url) return st.err(tr("ยังไม่ได้วาดลายเซ็น", "Nothing drawn yet"));
    saveSignature(url); pad.clear(); padUse.disabled = true;
    pickStamp(url); renderSaved();
  } });
  padUse.disabled = true;
  const padClear = button(tr("ล้างกระดาน", "Clear pad"), { ghost: true, onclick: () => { pad.clear(); padUse.disabled = true; } });
  const signUpInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        st.info(tr("กำลังเตรียมรูปลายเซ็น…", "Preparing the signature image…"));
        const url = await imageToSignature(f);
        saveSignature(url); pickStamp(url); renderSaved(); st.clear();
      } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
    } });
  const signUpBtn = button(tr("อัปโหลดรูปลายเซ็น", "Upload a signature image"),
    { ghost: true, icon: "upload", onclick: () => signUpInput.click() });
  const savedBox = el("div", { class: "pe-saved" });

  const imgInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        st.info(tr("กำลังเตรียมรูป…", "Preparing the image…"));
        /* ‼️ รูปทั่วไปไม่ถอดพื้นขาว ต่างจากลายเซ็น เพราะโลโก้หรือตราที่มีพื้นขาวจงใจ
           ถ้าไปถอดให้ จะได้รูปโหว่เป็นรูโดยที่ผู้ใช้ไม่ได้สั่ง */
        pickStamp(await fileToPng(f)); st.clear();
        st.ok(tr("เลือกรูปแล้ว คลิกตำแหน่งบนหน้าเพื่อวาง", "Image ready, click a spot on the page"));
      } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
    } });
  const imgBtn = button(tr("เลือกไฟล์รูป", "Choose an image"), { icon: "upload", onclick: () => imgInput.click() });
  const imgPreview = el("div", { class: "pe-saved" });

  /** แปลงไฟล์รูปอะไรก็ได้เป็น PNG (pdf-lib ฝังได้แน่นอนทั้ง PNG และ JPEG แต่ PNG เก็บความโปร่งไว้) */
  async function fileToPng(file) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close?.();
    return c.toDataURL("image/png");
  }

  function pickStamp(url) {
    stampUrl = url;
    renderSaved();
    imgPreview.replaceChildren(url && mode === "image"
      ? el("figure", { class: "on" }, [el("img", { src: url, alt: tr("รูปที่เลือก", "Chosen image") })]) : null);
  }

  function renderSaved() {
    const list = savedSignatures();
    savedBox.replaceChildren(...(list.length ? list : []).map((url) => {
      const fig = el("figure", { class: url === stampUrl ? "on" : "", role: "button", tabindex: "0",
        "aria-label": tr("ใช้ลายเซ็นนี้", "Use this signature"),
        onclick: () => pickStamp(url),
        onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pickStamp(url); } } }, [
        el("img", { src: url, alt: tr("ลายเซ็นที่บันทึกไว้", "Saved signature") }),
        el("button", { class: "x", type: "button", "aria-label": tr("ลบลายเซ็นนี้", "Delete this signature"),
          onclick: (ev) => { ev.stopPropagation(); removeSignature(url);
            if (stampUrl === url) stampUrl = null; renderSaved(); } }, "\u2715"),
      ]);
      return fig;
    }));
    if (!list.length) savedBox.replaceChildren(el("div", { class: "pe-hint" },
      tr("ยังไม่มีลายเซ็นที่บันทึกไว้ วาดในกรอบด้านบนหรืออัปโหลดรูปได้",
         "No saved signatures yet. Draw in the box above or upload an image")));
  }

  function segmentedModes() {
    const wrap = el("div", { class: "row" });
    const mk = (v, label, icon) => {
      const b = button(label, { icon, ghost: true, onclick: () => setMode(v) });
      b.dataset.mode = v;
      return b;
    };
    /* ‼️ เฟส 6 (21/09/2026) รวมงาน "วางของทับหน้า PDF" มาไว้ที่เดียว
       เดิมแยกเป็นสองเครื่องมือ (แก้ข้อความ กับ เซ็นชื่อ) ซึ่งเป็นงานเดียวกันในสายตาผู้ใช้
       คนที่ต้องแก้วันที่แล้วเซ็นด้วย ต้องบันทึกไฟล์แล้วเปิดอีกเครื่องมือหนึ่ง แล้วอัปโหลดใหม่
       = สองรอบสำหรับงานเดียว และไฟล์ผ่านการบันทึกซ้ำโดยไม่จำเป็น */
    wrap.append(
      mk("cover", tr("ปิดทับ", "Cover"), "trash"),
      mk("text", tr("ข้อความ", "Text"), "edit"),
      mk("highlight", tr("ไฮไลต์", "Highlight"), "rows"),
      mk("sign", tr("ลายเซ็น", "Signature"), "check"),
      mk("image", tr("รูป", "Image"), "stack"),
    );
    return wrap;
  }
  let mode = "cover";
  const MODE_HINT = () => ({
    cover: tr("ลากคลุมข้อความที่ต้องการลบ", "Drag over the text you want to remove"),
    text: tr("พิมพ์ข้อความด้านขวาก่อน แล้วคลิกตำแหน่งบนหน้า", "Type the text on the right, then click a spot"),
    highlight: tr("ลากคลุมข้อความที่อยากเน้น ตัวหนังสือใต้แถบยังอ่านออก",
                  "Drag over the text you want to mark. The text underneath stays readable"),
    sign: tr("เลือกหรือวาดลายเซ็นด้านขวา แล้วคลิกตำแหน่งบนหน้า",
             "Pick or draw your signature on the right, then click a spot"),
    image: tr("เลือกไฟล์รูปด้านขวา แล้วคลิกตำแหน่งบนหน้า", "Choose an image on the right, then click a spot"),
  }[mode] || "");
  function setMode(v) {
    mode = v;
    layer.classList.toggle("text-mode", v === "text");
    modeSeg.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.mode === v;
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", String(on));
    });
    /* ‼️ โชว์เฉพาะตัวเลือกของเครื่องมือที่เลือกอยู่ ไม่ใช่กองทุกกลุ่มไว้ตลอด
       ห้าเครื่องมือรวมกันมีตัวเลือกสิบกว่าช่อง ถ้าโชว์หมดพร้อมกันแผงจะกลายเป็นกำแพง
       และคนจะหาไม่เจอว่าช่องไหนเป็นของเครื่องมือที่กำลังใช้ */
    for (const g of groups) g.node.hidden = !g.modes.includes(v);
    st.info(MODE_HINT());
  }

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => {
      file = f[0] || null;
      results.innerHTML = "";
      edits = [];
      if (file) openFile();
      else resetAll();
    },
  });

  const zoomOutBtn = button("-", { ghost: true, label: tr("ซูมออก", "Zoom out"), onclick: () => stepZoom(-1) });
  const zoomLabel = el("span", { class: "pe-zoom" }, "100%");
  const zoomInBtn = button("+", { ghost: true, label: tr("ซูมเข้า", "Zoom in"), onclick: () => stepZoom(1) });
  const fitBtn = button(tr("พอดีหน้า", "Fit"), { ghost: true, onclick: () => setZoom(1) });

  function stepZoom(dir) {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
    setZoom(next);
  }
  function setZoom(z) {
    zoom = z;
    applyZoom();
    st.ok(tr(`ซูม ${Math.round(z * 100)}%`, `Zoom ${Math.round(z * 100)}%`));
  }
  /* ‼️ ซูมต้องเปลี่ยนแค่ "ความกว้างที่แสดง" ไม่ใช่เรนเดอร์ภาพใหม่
     เรนเดอร์ใหม่ทุกครั้งที่กดซูมจะหน่วงเป็นวินาทีกับไฟล์ที่มีรูปเยอะ
     ภาพที่เรนเดอร์ไว้ละเอียดกว่าจออยู่แล้ว ขยายด้วย CSS จึงยังคมพอ */
  function applyZoom() {
    if (!fitWidth) return;
    stage.style.width = `${Math.round(fitWidth * zoom)}px`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutBtn.disabled = zoom <= ZOOMS[0];
    zoomInBtn.disabled = zoom >= ZOOMS[ZOOMS.length - 1];
    drawOverlay();
  }

  /* ‼️ ทางเลือกที่ไม่ต้องลากเลย (WCAG 2.5.7) วางกลางหน้าก่อนแล้วค่อยกดลูกศรขยับ
     เดิมวางกล่องปิดทับได้ทางเดียวคือลากคลุมพื้นที่ คนที่ลากไม่ได้จึงใช้เครื่องมือนี้ไม่ได้เลย */
  const placeMidBtn = button(tr("วางกลางหน้า", "Place in the middle"), { icon: "plus", ghost: true,
    onclick: () => {
      if (!pdf) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
      if (mode === "text") placeText({ x: 0.4, y: 0.45 });
      else if (mode === "sign" || mode === "image") placeStamp({ x: 0.5, y: 0.5 });
      else {
        const hl = mode === "highlight";
        edits.push({ page: cur, kind: hl ? "highlight" : "cover", x: 0.35, y: 0.45, w: 0.3, h: 0.06,
                     color: hl ? hlColor.value : coverColor.value });
        drawOverlay(); renderThumbs(); syncButtons();
      }
      const boxes = layer.querySelectorAll(".pe-box");
      if (boxes.length) boxes[boxes.length - 1].focus();
      st.ok(tr("วางแล้ว กดปุ่มลูกศรเพื่อขยับ กด Alt ค้างพร้อมลูกศรเพื่อปรับขนาด",
               "Placed. Arrow keys move it, hold Alt with the arrows to resize"));
    } });
  const undoBtn = button(tr("ย้อนล่าสุด", "Undo last"), { icon: "undo", ghost: true, onclick: undoLast });
  const clearBtn = button(tr("ล้างหน้านี้", "Clear page"), { icon: "trash", ghost: true, onclick: clearPage });
  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  [placeMidBtn, undoBtn, clearBtn].forEach((b) => { b.disabled = true; });
  saveBtn.disabled = true;

  const leftNode = el("div", { class: "pe-left" }, [
    dz.container, extra,
    el("div", {}, [el("h3", {}, tr("หน้าในไฟล์", "Pages")), thumbs]),
  ]);
  /* กลุ่มตัวเลือกของแต่ละเครื่องมือ · setMode() เป็นคนเปิดปิดให้ */
  const grp = (modes, children) => ({ modes, node: el("div", { class: "pe-grp" }, children) });
  const groups = [
    grp(["text"], [
      el("h3", {}, tr("ข้อความที่จะใส่", "Text to add")),
      field(tr("ข้อความ", "Text"), textInput),
      el("div", { class: "row" }, [
        field(tr("ขนาด", "Size"), sizeSel),
        field(tr("น้ำหนัก", "Weight"), weightSel),
        field(tr("สีตัวอักษร", "Text colour"), textColor),
      ]),
    ]),
    grp(["cover"], [
      el("h3", {}, tr("สีที่ใช้ปิดทับ", "Cover colour")),
      field(tr("สี", "Colour"), coverColor,
        tr("ปกติใช้สีขาวให้กลืนกับกระดาษ", "White usually blends with the paper")),
      el("div", { class: "pe-hint" },
        tr("ปิดทับคือวางสี่เหลี่ยมทับข้อความเดิม ตัวอักษรเดิมยังอยู่ในไฟล์",
           "Cover puts a rectangle over the old text. The original text stays in the file")),
    ]),
    grp(["highlight"], [
      el("h3", {}, tr("สีไฮไลต์", "Highlight colour")),
      field(tr("สี", "Colour"), hlColor),
      el("div", { class: "pe-hint" },
        tr("แถบไฮไลต์โปร่งแสง ตัวหนังสือใต้แถบยังอ่านออกและยังค้นหาเจอ",
           "The band is translucent, so the text underneath stays readable and searchable")),
    ]),
    grp(["sign"], [
      el("h3", {}, tr("ลายเซ็นของคุณ", "Your signature")),
      el("div", { class: "pe-sign" }, [pad.node, el("div", { class: "row" }, [padUse, padClear]), signUpBtn, signUpInput]),
      el("h3", {}, tr("ที่บันทึกไว้", "Saved")),
      savedBox,
      el("div", { class: "row" }, [field(tr("ความกว้างบนหน้า", "Width on the page"), stampSize), stampSizeVal]),
      el("div", { class: "pe-hint" },
        tr("เป็นภาพวางทับหน้าเอกสาร ไม่ใช่ลายเซ็นดิจิทัลที่มีใบรับรองทางกฎหมาย",
           "This is an image on top of the page, not a certificate-based digital signature")),
    ]),
    grp(["image"], [
      el("h3", {}, tr("รูปที่จะวาง", "Image to place")),
      el("div", { class: "row" }, [imgBtn, imgInput]),
      imgPreview,
      el("div", { class: "row" }, [field(tr("ความกว้างบนหน้า", "Width on the page"), stampSize), stampSizeVal]),
    ]),
  ];
  const rightNode = el("div", { class: "pe-right" }, [
    el("div", {}, [el("h3", {}, tr("เครื่องมือ", "Tool")), modeSeg]),
    ...groups.map((g) => g.node),
  ]);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF file"), node: leftNode },
    center: { node: scroller, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อเริ่มแก้ไข", "No file yet. Choose a PDF to start") },
    right: { title: tr("ตัวเลือก", "Options"), node: rightNode },
    toolbar: [zoomOutBtn, zoomLabel, zoomInBtn, fitBtn, el("div", { class: "sep" }), placeMidBtn, undoBtn, clearBtn],
    toolbarGroups: [tr("มุมมอง", "View"), tr("สิ่งที่วางไว้", "Placed items")],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(results,
    /* ‼️ เขียนเฉพาะคีย์ที่มีอยู่จริงในโค้ด ไล่อ่าน handler ทีละตัวก่อนเขียน
       บอกคีย์ที่ไม่มีจริง แย่กว่าไม่บอกเลย เพราะคนกดแล้วคิดว่าเว็บพัง */
    keyHints([
      ["Del", tr("ลบสิ่งที่เลือก", "Delete selected")],
      ["\u2190 \u2191 \u2192 \u2193", tr("ขยับทีละนิด", "Nudge")],
      ["Shift + \u2190", tr("ขยับทีละมาก", "Move further")],
      ["Alt + \u2190", tr("ย่อขยายกล่องปิดทับ", "Resize the cover box")],
    ]),
    el("div", { class: "note" },
      tr("ปิดทับ, พิมพ์ข้อความใหม่, ไฮไลต์, เซ็นชื่อ และวางรูป ทำได้ในรอบเดียวแล้วบันทึกครั้งเดียว",
         "Cover, add text, highlight, sign and place images all in one pass, then save once")),
    el("div", { class: "note" },
      tr("ข้อความเดิมยังอยู่ในไฟล์ ถ้าเป็นความลับให้ใช้วิธีอื่น",
         "The original text remains in the file. Do not rely on this to hide secrets")),
  );
  ws.showCanvas(false);
  setMode("cover");

  function resetAll() {
    pdf?.destroy?.();
    pdf = null; pageCount = 0; cur = 0; edits = []; thumbData = [];
    thumbs.innerHTML = "";
    stage.hidden = true;
    st.clear();
    saveBtn.disabled = true;
    undoBtn.disabled = true;
    clearBtn.disabled = true;
    ws.showCanvas(false);
  }

  async function openFile() {
    resetAllKeepFile();
    st.info(tr("กำลังเปิดไฟล์…", "Opening file…"));
    ws.setBusy(true);
    try {
      pdf = await openPdf(file, passwordBox(extra));
      pageCount = pdf.numPages;
      for (let p = 1; p <= pageCount; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 0.2 });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        page.cleanup();
        thumbData.push(c.toDataURL("image/jpeg", 0.6));
        c.width = c.height = 0;
        st.progress((p / pageCount) * 100, `(${p}/${pageCount})`);
        await yieldToBrowser();
      }
      st.progress(null);
      renderThumbs();
      await showPage(0);
      ws.setBusy(false);
      ws.showCanvas(true);
      saveBtn.disabled = false;
      st.ok(tr(`เปิดแล้ว ${pageCount} หน้า`, `Opened ${pl(pageCount, "page", "pages")}`));
      setMode(mode);
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
    }
  }
  function resetAllKeepFile() {
    pdf?.destroy?.();
    pdf = null; thumbData = []; thumbs.innerHTML = "";
    stage.hidden = true; ws.showCanvas(false);
  }

  function renderThumbs() {
    thumbs.innerHTML = "";
    thumbData.forEach((src, i) => {
      const n = edits.filter((e) => e.page === i).length;
      const b = el("button", {
        class: "pe-thumb" + (i === cur ? " on" : ""), type: "button",
        "aria-label": tr(`ไปหน้า ${i + 1}`, `Go to page ${i + 1}`),
        "aria-pressed": String(i === cur),
        onclick: () => showPage(i),
      }, [
        el("img", { src, alt: tr(`หน้า ${i + 1}`, `Page ${i + 1}`), loading: "lazy" }),
        el("b", {}, String(i + 1)),
        n ? el("span", { class: "dot", title: tr(`แก้ไว้ ${n} จุด`, `${n} edits`) }) : null,
      ]);
      thumbs.appendChild(b);
    });
  }

  async function showPage(i) {
    if (!pdf || i < 0 || i >= pageCount) return;
    cur = i;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: VIEW_SCALE });
    viewCanvas.width = Math.floor(vp.width);
    viewCanvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: viewCanvas.getContext("2d"), viewport: vp }).promise;
    const base = page.getViewport({ scale: 1 });
    pageSize = { w: base.width, h: base.height };
    page.cleanup();
    stage.hidden = false;
    /* ‼️ ฐานของซูมคือ "กว้างเท่ากล่องกลาง" ไม่ใช่เลขตายตัว
       เดิมตรึงไว้ที่ 900px ซึ่งบนจอแคบก็ล้น บนจอกว้างก็ไม่ได้ใช้ที่ที่มี */
    const room = (scroller.clientWidth || 700) - 26;
    fitWidth = Math.max(240, Math.min(vp.width, room));
    applyZoom();
    renderThumbs();
    drawOverlay();
  }

  /* วาดกล่องที่แก้ไว้ทับบนหน้า
     ‼️ ใช้หน่วยเปอร์เซ็นต์ ไม่ใช่พิกเซล เพราะเวทีย่อขยายตามความกว้างจอ
        ถ้าเก็บเป็นพิกเซลของจอ พอจอเปลี่ยนขนาดกล่องจะเลื่อนไปคนละที่ */
  function drawOverlay() {
    layer.innerHTML = "";
    edits.filter((e) => e.page === cur).forEach((e) => {
      const boxy = e.kind === "cover" || e.kind === "highlight";   // ของที่มีความกว้างความสูงของตัวเอง
      const box = el("div", {
        class: `pe-box ${e.kind}`,
        /* ‼️ ต้องโฟกัสได้ ไม่งั้นคนใช้คีย์บอร์ดแก้ของที่วางไปแล้วไม่ได้เลย (WCAG 2.5.7) */
        tabindex: "0", role: "group",
        style: {
          left: `${e.x * 100}%`, top: `${e.y * 100}%`,
          width: boxy ? `${e.w * 100}%` : (e.kind === "stamp" ? `${e.rw * 100}%` : "auto"),
          height: boxy ? `${e.h * 100}%` : "auto",
          background: e.kind === "cover" ? e.color : (e.kind === "highlight" ? e.color : "transparent"),
          /* ‼️ จุดคลิกคือ "กึ่งกลาง" ของสิ่งที่วาง ทั้งภาพและข้อความ
             เพราะตอนบันทึกลงไฟล์ save() วางโดยให้จุดคลิกเป็นกึ่งกลางแนวตั้ง (y - h/2)
             ถ้าบนจอวางโดยเอาขอบบนไว้ที่จุดคลิก ของบนจอกับในไฟล์จะคลาดกันครึ่งบรรทัด
             วัดจริง 21/09/2026: บนจอกึ่งกลางอยู่ที่ 0.5100 แต่ในไฟล์อยู่ที่ 0.5000
             = เพี้ยน 1.4% ของหน้า หรือราว 12 พอยต์บน A4 ซึ่งพอให้วางทับวันที่เดิมไม่ลง
             ‼️ นี่คือเครื่องมือที่ขายว่า "วางตรงไหนได้ตรงนั้น" จึงห้ามคลาดแม้แต่นิด */
          transform: (e.kind === "stamp" || e.kind === "text") ? "translateY(-50%)" : null,
          color: e.kind === "text" ? e.color : null,
          fontSize: e.kind === "text" ? `${(e.size / pageSize.h) * 100 * (stage.clientHeight / 100)}px` : null,
          fontWeight: e.kind === "text" ? e.weight : null,
        },
      }, [
        e.kind === "text" ? e.text : null,
        e.kind === "stamp" ? el("img", { src: e.url, alt: "" }) : null,
        boxy || e.kind === "stamp"
          ? el("div", { class: "pe-grip", title: tr("ลากเพื่อปรับขนาด", "Drag to resize") }) : null,
        el("button", {
          class: "rm", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr("เอาการแก้นี้ออก", "Remove this edit"),
          onclick: (ev) => { ev.stopPropagation(); edits = edits.filter((x) => x !== e); drawOverlay(); syncButtons(); renderThumbs(); },
        }, "✕"),
      ]);
      const what = { cover: tr("กล่องปิดทับ", "Cover box"), highlight: tr("แถบไฮไลต์", "Highlight band"),
                     text: tr("ข้อความ", "Text"), stamp: e.what === "sign" ? tr("ลายเซ็น", "Signature") : tr("รูป", "Image"),
                   }[e.kind] || tr("สิ่งที่วางไว้", "Placed item");
      const say = () => box.setAttribute("aria-label", tr(
        `${what} ตำแหน่ง ${Math.round(e.x * 100)}% จากซ้าย ${Math.round(e.y * 100)}% จากบน กดลูกศรเพื่อขยับ กด Delete เพื่อเอาออก`,
        `${what} at ${Math.round(e.x * 100)}% from left, ${Math.round(e.y * 100)}% from top. Arrow keys move it, Delete removes it`));
      say();
      /* ‼️ ขยับทีละก้าวด้วยลูกศร แม่นกว่าการลากเพราะไม่มีทางพลาด
         ก้าวเล็ก 0.4% ของหน้า ก้าวใหญ่กด Shift = 5 เท่า
         กล่องปิดทับยังปรับขนาดด้วย Alt+ลูกศร ได้ด้วย เพราะลากมุมอย่างเดียวก็ตกเกณฑ์เหมือนกัน */
      box.addEventListener("keydown", (ev) => {
        const step = ev.shiftKey ? 0.02 : 0.004;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                    ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
        if (d) {
          ev.preventDefault();
          if (ev.altKey && (e.kind === "cover" || e.kind === "highlight")) {
            e.w = Math.min(1, Math.max(0.01, e.w + d[0]));
            e.h = Math.min(1, Math.max(0.01, e.h + d[1]));
          } else if (ev.altKey && e.kind === "stamp") {
            /* ภาพรักษาสัดส่วนเสมอ จึงปรับได้แค่ความกว้าง ลูกศรขึ้นลงก็ให้ผลเดียวกับซ้ายขวา */
            e.rw = Math.min(1, Math.max(0.03, e.rw + (d[0] || -d[1])));
          } else {
            e.x = Math.min(1, Math.max(0, e.x + d[0]));
            e.y = Math.min(1, Math.max(0, e.y + d[1]));
          }
          drawOverlay();
          const again = [...layer.querySelectorAll(".pe-box")][edits.filter((z) => z.page === cur).indexOf(e)];
          if (again) again.focus();
          return;
        }
        if (ev.key === "Delete" || ev.key === "Backspace") {
          ev.preventDefault();
          edits = edits.filter((x) => x !== e);
          drawOverlay(); syncButtons(); renderThumbs();
        }
      });
      bindMove(box, e);
      layer.appendChild(box);
    });
    syncButtons();
  }

  /* ลากย้ายของที่วางไปแล้ว และลากมุมเพื่อปรับขนาดกล่องปิดทับ
     ‼️ เดิมวางแล้วแก้ไม่ได้เลย ต้องลบทิ้งแล้วทำใหม่ ซึ่งกับงานจริงที่ต้องขยับทีละนิด
        ให้พอดีคำ คือทรมานมาก
     ‼️ ต้องหยุดไม่ให้เหตุการณ์ไหลไปถึงชั้นวาด ไม่งั้นการลากย้ายจะกลายเป็นสร้างกล่องใหม่ทับ */
  function bindMove(node, e) {
    let mode0 = null, from = null, orig = null;
    const rel = (ev) => {
      const r = layer.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    };
    node.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".rm")) return;
      ev.stopPropagation();
      ev.preventDefault();
      mode0 = ev.target.closest(".pe-grip") ? "resize" : "move";
      from = rel(ev);
      orig = { x: e.x, y: e.y, w: e.w, h: e.h, rw: e.rw };
      node.classList.add("moving");
      node.setPointerCapture(ev.pointerId);
    });
    node.addEventListener("pointermove", (ev) => {
      if (!mode0) return;
      const p = rel(ev);
      const dx = p.x - from.x, dy = p.y - from.y;
      if (mode0 === "move") {
        e.x = Math.max(0, Math.min(1, orig.x + dx));
        e.y = Math.max(0, Math.min(1, orig.y + dy));
      } else if (e.kind === "stamp") {
        // ภาพรักษาสัดส่วนเดิมเสมอ ปรับได้แค่ความกว้าง แล้วความสูงตามไปเอง
        e.rw = Math.max(0.03, Math.min(1, orig.rw + dx));
      } else {
        e.w = Math.max(0.004, orig.w + dx);
        e.h = Math.max(0.004, orig.h + dy);
      }
      node.style.left = `${e.x * 100}%`;
      node.style.top = `${e.y * 100}%`;
      if (e.kind === "cover" || e.kind === "highlight") {
        node.style.width = `${e.w * 100}%`;
        node.style.height = `${e.h * 100}%`;
      } else if (e.kind === "stamp") {
        node.style.width = `${e.rw * 100}%`;
      }
    });
    /* ‼️ คลิกทับของที่วางไปแล้ว ต้องวางชิ้นใหม่ได้ (เจอจริงตอนทำเทสเฟส 6 21/09/2026)
     * งานหลักของเครื่องมือนี้คือ "ปิดทับวันที่เดิม แล้วพิมพ์วันที่ใหม่ตรงนั้น"
     * ซึ่งแปลว่าต้องคลิกลงบนกล่องปิดทับที่เพิ่งวางไป
     * ของเดิมกล่องกินคลิกไว้หมดเพื่อใช้ลากย้าย ผู้ใช้จึงวางข้อความทับไม่ได้เลย
     * และไม่มีอะไรบอกด้วยว่าทำไมกดแล้วไม่เกิดอะไรขึ้น
     * แยกด้วยระยะที่ลาก: ขยับน้อยกว่า 0.6% ของหน้า = ตั้งใจคลิก ไม่ใช่ตั้งใจลาก */
    const end = (ev) => {
      if (!mode0) return;
      const moved = from && ev && (() => {
        const p = rel(ev);
        return Math.abs(p.x - from.x) > 0.006 || Math.abs(p.y - from.y) > 0.006;
      })();
      mode0 = null;
      node.classList.remove("moving");
      if (!moved && (mode === "text" || mode === "sign" || mode === "image")) {
        // คืนตำแหน่งเดิมก่อน เผื่อขยับไปนิดหน่อยระหว่างคลิก
        e.x = orig.x; e.y = orig.y;
        drawOverlay();
        const at = from;
        if (mode === "text") placeText(at); else placeStamp(at);
        return;
      }
      if (moved) st.ok(tr("ย้ายแล้ว", "Moved"));
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  function syncButtons() {
    const n = edits.length;
    placeMidBtn.disabled = !pdf;
    undoBtn.disabled = !n;
    clearBtn.disabled = !edits.some((e) => e.page === cur);
    st.info(n ? tr(`แก้ไว้ ${n} จุด`, `${n} edit${n > 1 ? "s" : ""} pending`) : "");
  }
  function undoLast() { edits.pop(); drawOverlay(); renderThumbs(); }
  function clearPage() { edits = edits.filter((e) => e.page !== cur); drawOverlay(); renderThumbs(); }

  // ── ลากคลุมเพื่อปิดทับ กับ คลิกเพื่อวางข้อความ ─────────────────────────
  let start = null, ghost = null;
  const rel = (ev) => {
    const r = layer.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  const isDrag = () => mode === "cover" || mode === "highlight";
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf || ev.target.closest(".rm")) return;
    if (mode === "text") return placeText(rel(ev));
    if (mode === "sign" || mode === "image") return placeStamp(rel(ev));
    start = rel(ev);
    ghost = el("div", { class: `pe-box ${mode}`,
      style: { background: mode === "highlight" ? hlColor.value : coverColor.value, opacity: ".75" } });
    layer.appendChild(ghost);
    layer.setPointerCapture(ev.pointerId);
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || !ghost) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    ghost.style.left = `${x * 100}%`; ghost.style.top = `${y * 100}%`;
    ghost.style.width = `${Math.abs(p.x - start.x) * 100}%`;
    ghost.style.height = `${Math.abs(p.y - start.y) * 100}%`;
  });
  layer.addEventListener("pointerup", (ev) => {
    if (!start) return;
    const p = rel(ev);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    ghost?.remove(); ghost = null; start = null;
    // กันคลิกพลาดกลายเป็นกล่องจิ๋วที่มองไม่เห็นแต่ค้างอยู่ในไฟล์
    if (w < 0.004 || h < 0.004) { drawOverlay(); return; }
    const hl = mode === "highlight";
    edits.push({ page: cur, kind: hl ? "highlight" : "cover", x, y, w, h,
                 color: hl ? hlColor.value : coverColor.value });
    drawOverlay(); renderThumbs();
    st.ok(hl ? tr("ไฮไลต์แล้ว 1 จุด", "Highlighted one spot")
             : tr("ปิดทับแล้ว 1 จุด", "Covered one spot"));
  });

  /** วางลายเซ็นหรือรูปที่จุดที่คลิก (จุดคลิก = กึ่งกลางของภาพ) */
  function placeStamp(p) {
    if (!stampUrl) {
      st.err(mode === "sign"
        ? tr("เลือกหรือวาดลายเซ็นด้านขวาก่อน", "Pick or draw a signature on the right first")
        : tr("เลือกไฟล์รูปด้านขวาก่อน", "Choose an image on the right first"));
      return;
    }
    const rw = (+stampSize.value || 22) / 100;
    edits.push({ page: cur, kind: "stamp", x: Math.max(0, p.x - rw / 2), y: p.y, rw, url: stampUrl,
                 what: mode === "sign" ? "sign" : "image" });
    drawOverlay(); renderThumbs();
    st.ok(tr("วางแล้ว ลากเพื่อย้าย หรือลากมุมเพื่อย่อขยาย", "Placed. Drag to move, or drag the corner to resize"));
  }

  function placeText(p) {
    const text = textInput.value.trim();
    if (!text) { st.err(tr("พิมพ์ข้อความด้านขวาก่อน", "Type the text on the right first")); return; }
    edits.push({ page: cur, kind: "text", x: p.x, y: p.y, text,
                 size: +sizeSel.value, color: textColor.value, weight: +weightSel.value });
    drawOverlay(); renderThumbs();
    st.ok(tr("วางข้อความแล้ว", "Text placed"));
  }

  async function save() {
    if (!file) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!edits.length) return st.err(tr("ยังไม่ได้แก้อะไรเลย", "No edits yet"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, rgb } = PDFLib;
      const { doc, encrypted } = await loadPdfLib(file);
      const pages = doc.getPages();
      for (const e of edits) {
        const page = pages[e.page];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        if (e.kind === "cover" || e.kind === "highlight") {
          const c = hexToRgb01(e.color);
          /* ‼️ PDF นับแกนตั้งจากล่างขึ้นบน ส่วนหน้าจอนับจากบนลงล่าง
             ต้องกลับด้าน ไม่งั้นกล่องไปโผล่คนละที่กับที่ผู้ใช้ลาก */
          page.drawRectangle({
            x: e.x * pw, y: ph - (e.y + e.h) * ph,
            width: e.w * pw, height: e.h * ph,
            color: rgb(c.r, c.g, c.b),
            /* ‼️ ไฮไลต์ต้องโปร่งจริงในไฟล์ด้วย ไม่ใช่แค่บนจอ
               ถ้าทึบ ตัวหนังสือใต้แถบจะหายไปเลย ซึ่งไม่ใช่สิ่งที่คำว่าไฮไลต์หมายถึง
               0.38 มาจากการลองพิมพ์ดู ต่ำกว่านี้แทบไม่เห็นแถบ สูงกว่านี้เริ่มกลืนตัวอักษร */
            opacity: e.kind === "highlight" ? 0.38 : 1,
          });
        } else if (e.kind === "stamp") {
          /* ภาพ PNG พื้นโปร่ง วางโดยให้จุดที่ผู้ใช้คลิกเป็นกึ่งกลางแนวตั้ง
             ความสูงคำนวณจากสัดส่วนจริงของภาพ ไม่ใช่เดา ไม่งั้นลายเซ็นจะแบนหรือยืด */
          const png = await doc.embedPng(e.url);
          const w = e.rw * pw;
          const h = (png.height / png.width) * w;
          page.drawImage(png, { x: e.x * pw, y: ph - e.y * ph - h / 2, width: w, height: h });
        } else {
          const { dataUrl, w, h } = textToPng(e.text, { fontSize: e.size, color: e.color, weight: e.weight });
          const png = await doc.embedPng(dataUrl);
          page.drawImage(png, { x: e.x * pw, y: ph - e.y * ph - h / 2, width: w, height: h });
        }
        await yieldToBrowser();
      }
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + tr("-แก้ไขแล้ว.pdf", "-edited.pdf");
      st.ok(tr(`บันทึกแล้ว แก้ไป ${edits.length} จุด`, `Saved with ${edits.length} edit${edits.length > 1 ? "s" : ""}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} หน้า`, `${pl(pageCount, "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่ได้: ", "Couldn't save: ") + e.message);
    } finally {
      ws.setBusy(false);
      saveBtn.disabled = false;
    }
  }

  return ws.wrap;
}
