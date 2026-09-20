import { loadPdfLib, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, download, stripExt, fmtBytes,
         registerCleanup, yieldToBrowser } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

/* ── ลบชั้นที่ทับบนหน้า PDF ─────────────────────────────────────────────────
 * ‼️ ทำไมชื่อว่า "ลบชั้นที่ทับ" ไม่ใช่ "ลบลายน้ำอัตโนมัติ" (ตัดสินจากการวัดจริง 19/09/2026)
 *   ลายน้ำใน PDF เก็บได้หลายแบบ และมีแบบที่ลบไม่ได้จริง ๆ อยู่ด้วย
 *   เครื่องมือที่อ้างว่า "ลบอัตโนมัติ" แล้วสำเร็จ 40-50% คือเครื่องมือที่โกหกผู้ใช้ครึ่งหนึ่งของเวลา
 *   เราจึงบอกตรง ๆ ว่าเราทำอะไรได้ ให้ผู้ใช้เห็นชั้นที่ถอดได้ แล้วเลือกเอง พร้อมพรีวิวสด
 *
 * ‼️ กฎเหล็ก: ตัดได้เฉพาะ "ทั้งชั้น" ห้ามตัดข้างในชั้นเด็ดขาด
 *   วัดจริงแล้วว่าการใช้ regex ตัดเฉพาะบล็อก q...Q ที่มีลายน้ำ **กินเนื้อหาจริงไปทั้งก้อน**
 *   เพราะ regex ไม่รู้จักการซ้อนของ q/Q นั่นคือการทำลายเอกสารผู้ใช้แบบเงียบ ๆ
 *   ซึ่งแย่กว่าทำไม่ได้เลย ถ้าจะตัดข้างในต้องเขียนตัวแยกวิเคราะห์ content stream จริง
 *
 * ‼️ โครงสร้างที่พบจริงจากเครื่องมือใส่ลายน้ำ (รวมถึงของเราเอง)
 *   Contents ของหน้าเป็น "อาร์เรย์ของสตรีม" แล้วลายน้ำถูกต่อท้ายเป็นสตรีมแยกก้อนของตัวเอง
 *   ข้างในมีแต่ q /GS gs ... cm ... /Image Do Q ไม่มีตัวดำเนินการข้อความเลย
 *   = เคสที่พบบ่อยที่สุดคือเคสที่ตัดทั้งก้อนได้อย่างปลอดภัย
 *   พิสูจน์ด้วยการเทียบพิกเซลหน้าที่เรนเดอร์: ลายน้ำหาย 14,139 พิกเซล เนื้อหาจริงเหลือครบ 216
 *
 * ‼️ ลายน้ำที่เจอจริงมี 3 ที่อยู่ ไม่ใช่ที่เดียว (วัดจริง 19/09/2026 ด้วยไฟล์ที่สร้างเองทั้งสามแบบ)
 *   ① สตรีมเนื้อหาแยกก้อน  ② annotation ชนิด Stamp/Watermark/FreeText  ③ optional content group (OCG)
 *   รอบแรกเครื่องมือนี้ดูแค่ข้อ ① แล้วตอบว่า "ลายน้ำถูกวาดปนอยู่กับเนื้อหา" กับอีกสองแบบ
 *   ซึ่งเป็นคำตอบที่ผิด เพราะทั้งสองแบบเอาออกได้ง่ายกว่าแบบแรกอีก การบอกเหตุผลผิดแย่กว่าบอกว่าทำไม่ได้
 *   annotation = ลบทิ้งได้สนิท ไม่ใช่เนื้อหาของหน้า · OCG = ปิดได้ตามสเปก แต่ข้อมูลยังอยู่ในไฟล์ ต้องบอกผู้ใช้ตรง ๆ
 *   ‼️ annotation ที่ห้ามแตะเด็ดขาดคือ Link (ลิงก์) กับ Widget (ช่องกรอกฟอร์ม) เพราะเป็นของใช้งาน ไม่ใช่ของทับ
 *
 * ‼️ pdf-lib แก้ content stream ได้จริง (เอกสารหลายที่บอกว่าไม่ได้ ซึ่งผิด)
 *   ต้องหยิบค่าด้วย node.get(Contents) ไม่ใช่ node.Contents()
 *   เพราะอันหลังคืน "ตัวสตรีมที่แกะแล้ว" ถ้าเอาใส่กลับตรง ๆ จะได้ PDF ผิดสเปกและไฟล์เสียทันที
 */

if (!document.getElementById("us-style")) {
  const style = el("style", { id: "us-style" });
  style.textContent = `
.us-left,.us-right{display:flex;flex-direction:column;gap:14px}
.us-stage{
  position:relative;width:100%;height:min(58vh,560px);min-height:260px;display:grid;place-items:center;
  border-radius:var(--r);border:1px solid var(--line-soft);background:var(--bg-soft);overflow:auto;
}
.us-stage canvas{max-width:100%;max-height:100%;display:block;background:#fff;box-shadow:var(--sh2)}
.us-stage.busy{opacity:.55}
.us-nav{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-dim);font-weight:600}
.us-nav b{font-variant-numeric:tabular-nums}
/* ‼️ ชั้นที่ถอดได้ทำเป็นแถวติ๊ก ไม่ใช่ปุ่มลบ เพราะต้องกลับมาเปิดดูใหม่ได้ตลอด
   ผู้ใช้จะได้ลองเปิดปิดจนแน่ใจก่อนบันทึก ไม่ใช่ลบแล้วลุ้น */
.us-layer{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;border-radius:var(--r-sm);
  border:1px solid var(--line-soft);background:var(--bg-soft);cursor:pointer}
.us-layer:hover{border-color:var(--line)}
.us-layer input{margin-top:2px;flex:none}
.us-layer .us-t{font-size:12.5px;font-weight:600;line-height:1.5}
.us-layer .us-s{display:block;font-size:11.5px;color:var(--text-mute);font-weight:400;line-height:1.5}
.us-blocked{font-size:12px;color:var(--text-mute);line-height:1.65}
.us-blocked b{color:var(--text-dim)}
@media (pointer:coarse){ .us-layer{padding:12px 10px} }
`;
  document.head.appendChild(style);
}

/** นับตัวดำเนินการแบบคำเดี่ยว (ต้องมีขอบคำ ไม่งั้น q ใน "Tq" ก็ถูกนับ) */
const countOp = (t, op) => (t.match(new RegExp(`(^|[\\s])${op}(?=[\\s]|$)`, "g")) || []).length;

/**
 * อ่านว่าชั้นนี้เป็นอะไร และถอดออกได้ไหม
 *
 * ‼️ เงื่อนไขถอดได้ต้องครบสามข้อ ขาดข้อใดข้อหนึ่งคือห้ามแตะ
 *   ① ไม่มีตัวดำเนินการข้อความ (BT) — ถ้ามีแปลว่ามีเนื้อหาจริงอยู่ในชั้นนี้
 *   ② จำนวน q กับ Q เท่ากัน — ถ้าไม่เท่าแปลว่าชั้นนี้เป็นแค่ครึ่งวงเล็บของชั้นอื่น
 *      (พบจริง: เครื่องมือบางตัวใส่ "q" ไว้ชั้นหนึ่งและ "Q" อีกชั้นหนึ่ง คร่อมเนื้อหาไว้ตรงกลาง
 *       ถอดออกข้างเดียวแล้วสถานะกราฟิกของทั้งหน้าจะพังทันที)
 *   ③ มีการวาดของจริง (เรียก XObject หรือระบายรูปทรง) ไม่งั้นถอดไปก็ไม่ได้อะไร
 */
function classify(t) {
  const q = countOp(t, "q"), Q = countOp(t, "Q");
  const hasText = /(^|[\s])BT(?=[\s]|$)/.test(t);
  const doN = (t.match(/\/[\w#+-]+\s+Do(?=[\s]|$)/g) || []).length;
  const paint = /(^|[\s])(f|f\*|S|s|B|B\*|b|b\*|sh)(?=[\s]|$)/.test(t);
  return {
    hasText, doN, paint, balanced: q === Q, len: t.length,
    removable: !hasText && q === Q && (doN > 0 || paint),
  };
}

/** ลายเซ็นของชั้น ใช้จับคู่ชั้นเดียวกันข้ามหน้า
 *  ‼️ ต้องลบตัวเลขและชื่อทรัพยากรออกก่อน เพราะลายน้ำหน้าเดียวกันคนละหน้า
 *     ใช้ชื่อ XObject คนละชื่อและตำแหน่งคนละค่า (วัดจริง: Image-7098480789 กับ Image-2000805986)
 *     ถ้าไม่ลบออก จะกลายเป็นคนละชั้นทั้งที่เป็นลายน้ำอันเดียวกัน */
const sigOf = (t) => t.replace(/\/[\w#+-]+/g, "/N").replace(/[-\d.]+/g, "#")
                      .replace(/\s+/g, " ").trim().slice(0, 140);

/** annotation ที่ถือว่า "ทับอยู่ข้างบน" และลบทิ้งได้ · Link กับ Widget ไม่อยู่ในนี้โดยตั้งใจ */
const STAMP_KINDS = new Set(["Stamp", "Watermark", "FreeText", "Square", "Circle", "Polygon", "PolyLine", "Ink", "Line"]);
const KEEP_KINDS = new Set(["Link", "Widget", "Popup"]);

export function mount(tool) {
  let file = null;
  let ready = false;
  let groups = [];          // ชั้นที่ถอดได้ จับกลุ่มข้ามหน้าแล้ว
  let blocked = [];         // ชั้นที่แตะไม่ได้ พร้อมเหตุผล
  let pageNo = 1, pageCount = 0;
  let rendering = false, pending = false;

  const st = statusBar();
  const view = el("canvas", {});
  const stage = el("div", { class: "us-stage" }, [view]);
  const pageLabel = el("b", {}, "—");
  const prevBtn = button("", { icon: "undo", ghost: true, label: tr("หน้าก่อนหน้า", "Previous page"),
    onclick: () => { if (pageNo > 1) { pageNo--; renderPreview(); } } });
  const nextBtn = button("", { icon: "undo", ghost: true, label: tr("หน้าถัดไป", "Next page"),
    onclick: () => { if (pageNo < pageCount) { pageNo++; renderPreview(); } } });
  nextBtn.style.transform = "scaleX(-1)";
  const nav = el("div", { class: "us-nav" }, [prevBtn, pageLabel, nextBtn]);

  const layerBox = el("div", { class: "us-right" });
  const blockedBox = el("div", { class: "us-blocked" });
  const rightBody = el("div", { class: "us-right" }, [
    el("div", {}, [el("h3", {}, tr("ชั้นที่ถอดออกได้", "Layers you can remove")), layerBox]),
    el("div", {}, [el("h3", {}, tr("ชั้นที่ไม่แตะ", "Layers left alone")), blockedBox]),
  ]);

  const dz = dropzone({
    accept: "application/pdf,.pdf", expect: ["pdf"], multiple: false,
    expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ลากไฟล์ PDF มาวาง หรือคลิกเพื่อเลือก", "Drop a PDF here, or click to choose"),
    /* ‼️ ต้องใช้ไฟล์ตัวอย่างของตัวเอง ไม่ใช่ PDF กลางตามชนิด
       เพราะ PDF กลางไม่มีชั้นทับอยู่เลย กดปุ่มลองตัวอย่างแล้วจะเจอ "ไม่มีอะไรให้ลบ"
       ซึ่งเป็นคำตอบที่ถูกต้องแต่สาธิตอะไรไม่ได้สักอย่าง */
    samples: [["samples/ตัวอย่าง-เอกสารมีลายน้ำ.pdf",
               "เอกสารที่มีลายน้ำทับ (PDF)", "Document with a watermark (PDF)"]],
    onChange: (next) => {
      file = next[0] || null;
      if (!file) { reset(); return; }
      analyse();
    },
  });

  function reset() {
    groups = []; blocked = []; ready = false; pageNo = 1; pageCount = 0;
    layerBox.innerHTML = ""; blockedBox.textContent = "";
    ws.showCanvas(false); st.clear(); go.disabled = true;
  }

  /** อ่านโครงชั้นของทุกหน้า แล้วจับกลุ่มชั้นที่หน้าตาเหมือนกัน */
  async function analyse() {
    st.info(tr("กำลังอ่านโครงของไฟล์…", "Reading the file structure…"));
    ws.setBusy(true);
    try {
      /* ‼️ loadPdfLib ของโปรเจกต์เปิดเอกสารให้เลย และล้างเมทาดาทาของไฟล์ต้นฉบับให้ด้วย
         (ชื่อ ผู้แต่ง โปรแกรมที่สร้าง) ซึ่งเป็นกติกาของทุกเครื่องมือที่แก้ไขเอกสารเดิม
         ถ้าเปิดเองด้วย PDFDocument.load จะข้ามการล้างนั้นไปเงียบ ๆ */
      const { doc } = await loadPdfLib(file);
      ready = true;
      const L = window.PDFLib;
      pageCount = doc.getPageCount();
      const look = (r) => (r instanceof L.PDFRef ? doc.context.lookup(r) : r);
      const dec = (s) => new TextDecoder("latin1").decode(L.decodePDFRawStream(s).decode());

      const byId = new Map();
      const textLayers = [];
      for (let i = 0; i < pageCount; i++) {
        const node = doc.getPage(i).node;
        const c = node.get(L.PDFName.of("Contents"));
        const refs = c instanceof L.PDFArray ? c.asArray() : [c];
        refs.forEach((r, k) => {
          let t;
          try { t = dec(look(r)); } catch { return; }
          const info = classify(t);
          if (!info.removable) {
            if (info.hasText) textLayers.push(i);
            else if (!info.balanced) blocked.push({ why: "brace", page: i });
            return;
          }
          const id = sigOf(t);
          const g = byId.get(id) || { id, pages: [], slots: [], doN: info.doN, paint: info.paint, len: 0, on: true };
          g.pages.push(i + 1); g.slots.push([i, k]); g.len += info.len;
          byId.set(id, g);
        });
      }
      /* ── annotation ที่วางทับหน้า ──────────────────────────────────────────
         ลบได้สนิทและปลอดภัยกว่าสตรีม เพราะ annotation ไม่ใช่เนื้อหาของหน้าเลย
         แค่ถอดออกจากรายการ /Annots ของหน้านั้น เนื้อหาจริงไม่มีทางถูกแตะ */
      let keepAnnots = 0;
      for (let i = 0; i < pageCount; i++) {
        const node = doc.getPage(i).node;
        const an = node.get(L.PDFName.of("Annots"));
        if (!(an instanceof L.PDFArray)) continue;
        an.asArray().forEach((r, k) => {
          const d = look(r);
          if (!d || typeof d.get !== "function") return;
          const sub = d.get(L.PDFName.of("Subtype"));
          const kind = sub && sub.asString ? sub.asString().replace(/^\//, "") : "";
          if (KEEP_KINDS.has(kind)) { keepAnnots++; return; }
          if (!STAMP_KINDS.has(kind)) return;
          const txt = d.get(L.PDFName.of("Contents"));
          const nm = d.get(L.PDFName.of("Name"));
          const label = (txt && txt.decodeText ? txt.decodeText() : "") || (nm && nm.asString ? nm.asString() : "");
          const id = `annot:${kind}:${label}`.slice(0, 140);
          const g = byId.get(id) || { id, kind, label, annot: true, pages: [], slots: [], on: true };
          g.pages.push(i + 1); g.slots.push([i, k]);
          byId.set(id, g);
        });
      }

      /* ── optional content group = "ชั้น" ตามที่ Acrobat เรียก ─────────────
         ‼️ ปิดได้ตามสเปก (ใส่ชื่อลงรายการ /OFF) แต่เนื้อหายังอยู่ในไฟล์
            ตัดออกจริงต้องไปตัดข้างในสตรีมตรง BDC/EMC ซึ่งเป็นสิ่งที่เครื่องมือนี้ห้ามทำ
            จึงเสนอเป็น "ปิด" และบอกตรง ๆ ว่าข้อมูลยังอยู่ ไม่หลอกว่าลบแล้ว */
      const ocp = doc.catalog.get(L.PDFName.of("OCProperties"));
      const ocgs = ocp && ocp.get ? ocp.get(L.PDFName.of("OCGs")) : null;
      if (ocgs instanceof L.PDFArray) {
        ocgs.asArray().forEach((r) => {
          const d = look(r);
          if (!d || typeof d.get !== "function") return;
          const nm = d.get(L.PDFName.of("Name"));
          const label = nm && nm.decodeText ? nm.decodeText() : "";
          byId.set(`ocg:${label}`, { id: `ocg:${label}`, ocg: true, ref: r, label,
                                     pages: [], slots: [], on: true });
        });
      }

      groups = [...byId.values()].sort((a, b) => b.pages.length - a.pages.length);
      blocked = blocked.concat(textLayers.length ? [{ why: "text", n: textLayers.length }] : []);
      if (keepAnnots) blocked.push({ why: "useful", n: keepAnnots });
      buildLayerList();
      ws.showCanvas(true);
      pageNo = 1;
      await renderPreview();
      if (!groups.length) {
        st.err(tr("ไฟล์นี้ไม่มีชั้นที่ถอดออกได้ ลายน้ำน่าจะถูกวาดปนอยู่กับเนื้อหา หรืออบเป็นภาพไปแล้ว",
                  "No removable layer in this file. The stamp is likely drawn into the content, or already flattened into an image"));
      } else { sayState(); }
      go.disabled = !groups.length;
    } catch (e) {
      st.err(tr("เปิดไฟล์นี้ไม่ได้: ", "Could not open this file: ") + e.message);
      go.disabled = true;
    } finally { ws.setBusy(false); }
  }

  function buildLayerList() {
    layerBox.innerHTML = "";
    groups.forEach((g, i) => {
      const cb = el("input", { type: "checkbox", checked: g.on || null,
        onchange: () => { g.on = cb.checked; schedule(); } });
      let head, sub;
      if (g.ocg) {
        head = tr(`ชั้น "${g.label || "ไม่มีชื่อ"}"`, `Layer "${g.label || "unnamed"}"`);
        sub = tr("ปิดไม่ให้แสดง ข้อมูลยังอยู่ในไฟล์", "Hidden, but the data stays in the file");
      } else if (g.annot) {
        const what = g.label
          ? tr(`ตราทับข้อความว่า "${g.label}"`, `stamp reading "${g.label}"`)
          : tr("ตราหรือรูปที่วางทับ", "a stamp placed on top");
        head = tr(`ของที่วางทับชิ้นที่ ${i + 1}`, `Stamp ${i + 1}`);
        sub = tr(`${what}  พบใน ${g.pages.length} หน้า`, `${what}, on ${pl(g.pages.length, "page", "pages")}`);
      } else {
        const what = g.doN
          ? tr(`วาดรูปหรือตรา ${g.doN} ชิ้น`, `draws ${pl(g.doN, "image or stamp", "images or stamps")}`)
          : tr("ระบายรูปทรงทับ", "paints a shape on top");
        head = tr(`ชั้นที่ ${i + 1}`, `Layer ${i + 1}`);
        sub = tr(`${what}  พบใน ${g.pages.length} หน้า`, `${what}, on ${pl(g.pages.length, "page", "pages")}`);
      }
      layerBox.appendChild(el("label", { class: "us-layer" }, [cb,
        el("span", { class: "us-t" }, [head, el("small", { class: "us-s" }, sub)])]));
    });
    if (!groups.length) {
      layerBox.appendChild(el("div", { class: "us-blocked" },
        tr("ไม่พบชั้นที่ถอดออกได้ในไฟล์นี้", "No removable layer found in this file")));
    }
    // ‼️ บอกตรง ๆ ว่าอะไรที่เราไม่แตะและเพราะอะไร ไม่ปล่อยให้เดาเอง
    const lines = [];
    const txt = blocked.find((b) => b.why === "text");
    if (txt) lines.push(tr(
      `${txt.n} ชั้นมีข้อความจริงอยู่ข้างใน จึงไม่แตะ ถ้าลายน้ำปนอยู่ในนั้น เอาออกให้ไม่ได้`,
      `${txt.n} layers hold real text, so they are never touched. A stamp inside one cannot be removed`));
    const use = blocked.find((b) => b.why === "useful");
    if (use) lines.push(tr(
      `มีลิงก์หรือช่องกรอกฟอร์ม ${use.n} จุด ไม่ถูกแตะ เพราะเป็นของใช้งาน ไม่ใช่ของที่วางทับ`,
      `${use.n} links or form fields are left alone, they are functional, not stamped on`));
    const br = blocked.filter((b) => b.why === "brace").length;
    if (br) lines.push(tr(
      `อีก ${br} ชั้นเป็นวงเล็บกราฟิกครึ่งเดียว ถอดข้างเดียวแล้วหน้าจะเพี้ยน`,
      `${br} more are half of a graphics-state pair. Removing one side would break the page`));
    blockedBox.innerHTML = "";
    for (const t of lines) blockedBox.appendChild(el("p", { style: { margin: "0 0 8px" } }, t));
    if (!lines.length) blockedBox.textContent = tr("ไม่มี ทุกชั้นในไฟล์นี้ถอดออกได้", "None. Every layer here can be removed");
  }

  /** สร้างไบต์ของไฟล์ผลลัพธ์ตามชั้นที่ติ๊กไว้ (ไม่ติ๊ก = ถอดออก) */
  async function build() {
    const L = window.PDFLib;
    // ‼️ เปิดใหม่ทุกครั้งจากไฟล์ต้นฉบับ ไม่แก้เอกสารเดิมสะสม
    //    ไม่งั้นติ๊กกลับเข้ามาแล้วชั้นที่เคยเอาออกจะไม่กลับมา
    const { doc } = await loadPdfLib(file);
    const drop = new Set(), dropAnnot = new Set(), offOcg = [];
    for (const g of groups) {
      if (g.on) continue;
      if (g.ocg) { offOcg.push(g.ref); continue; }
      const into = g.annot ? dropAnnot : drop;
      for (const [p, k] of g.slots) into.add(`${p}:${k}`);
    }
    for (let i = 0; i < doc.getPageCount(); i++) {
      const node = doc.getPage(i).node;
      const an = node.get(L.PDFName.of("Annots"));
      if (an instanceof L.PDFArray) {
        const list = an.asArray();
        const keepA = list.filter((_, k) => !dropAnnot.has(`${i}:${k}`));
        if (keepA.length !== list.length) node.set(L.PDFName.of("Annots"), doc.context.obj(keepA));
      }
      const c = node.get(L.PDFName.of("Contents"));
      const refs = c instanceof L.PDFArray ? c.asArray() : [c];
      const keep = refs.filter((_, k) => !drop.has(`${i}:${k}`));
      if (keep.length === refs.length) continue;
      /* ‼️ ต้องใส่กลับเป็น reference เสมอ และถ้าเหลือชิ้นเดียวก็ใส่ชิ้นเดียว ไม่ห่ออาร์เรย์
         (ทั้งสองแบบถูกตามสเปก แต่แบบชิ้นเดียวเล็กกว่าและเข้ากันได้กว้างกว่า) */
      node.set(L.PDFName.of("Contents"), keep.length === 1 ? keep[0] : doc.context.obj(keep));
    }
    /* ‼️ ปิด OCG ด้วยการใส่ลงรายการ /OFF ของ default configuration ตามสเปก
       ต้องเขียนทั้ง /OFF และ /ON ให้สอดคล้องกัน ไม่งั้นโปรแกรมอ่านบางตัวจะเปิดกลับมาเอง */
    if (offOcg.length) {
      const ocp = doc.catalog.get(L.PDFName.of("OCProperties"));
      const cfg = ocp && ocp.get ? ocp.get(L.PDFName.of("D")) : null;
      if (cfg && cfg.set) {
        const was = cfg.get(L.PDFName.of("OFF"));
        const prev = was instanceof L.PDFArray ? was.asArray() : [];
        cfg.set(L.PDFName.of("OFF"), doc.context.obj([...prev, ...offOcg]));
        const on = cfg.get(L.PDFName.of("ON"));
        if (on instanceof L.PDFArray) {
          const keepOn = on.asArray().filter((r) => !offOcg.some((o) => o.toString() === r.toString()));
          cfg.set(L.PDFName.of("ON"), doc.context.obj(keepOn));
        }
      }
    }
    return doc.save();
  }

  /** ข้อความบอกสถานะให้ตรงกับที่ติ๊กไว้จริง ไม่ค้างเป็นคำแนะนำเดิม */
  function sayState() {
    const off = groups.filter((g) => !g.on).length;
    if (!off) {
      st.ok(tr(`พบชั้นที่ถอดออกได้ ${groups.length} ชั้น ติ๊กออกแล้วดูผลทางซ้ายได้เลย`,
               `Found ${pl(groups.length, "removable layer", "removable layers")}. Untick one and watch the preview`));
    } else {
      st.ok(tr(`กำลังเอาออก ${off} ชั้น กดบันทึกไฟล์เมื่อพอใจ`,
               `Removing ${pl(off, "layer", "layers")}. Save when it looks right`));
    }
  }

  function schedule() {
    sayState();
    if (rendering) { pending = true; return; }
    renderPreview();
  }

  async function renderPreview() {
    if (!ready) return;
    rendering = true; stage.classList.add("busy");
    try {
      const bytes = await build();
      const pdf = await openPdf(new File([bytes], "preview.pdf", { type: "application/pdf" }),
                                passwordBox(rightBody));
      pageCount = pdf.numPages;
      pageNo = Math.min(Math.max(1, pageNo), pageCount);
      const page = await pdf.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.6, Math.max(0.5, 520 / base.height));
      const vp = page.getViewport({ scale });
      view.width = Math.floor(vp.width); view.height = Math.floor(vp.height);
      await page.render({ canvasContext: view.getContext("2d"), viewport: vp }).promise;
      page.cleanup();
      pdf.destroy?.();
      pageLabel.textContent = tr(`หน้า ${pageNo} จาก ${pageCount}`, `Page ${pageNo} of ${pageCount}`);
      prevBtn.disabled = pageNo <= 1;
      nextBtn.disabled = pageNo >= pageCount;
    } catch (e) {
      st.err(tr("แสดงตัวอย่างไม่ได้: ", "Could not draw the preview: ") + e.message);
    } finally {
      rendering = false; stage.classList.remove("busy");
      if (pending) { pending = false; await yieldToBrowser(); renderPreview(); }
    }
  }

  const results = el("div", {});
  const go = button(tr("บันทึกไฟล์", "Save file"), { onclick: () => save() });
  go.disabled = true;

  async function save() {
    if (!ready) return;
    go.disabled = true;
    st.begin(); st.info(tr("กำลังสร้างไฟล์…", "Building the file…"));
    try {
      const bytes = await build();
      const off = groups.filter((g) => !g.on).length;
      const blob = new Blob([bytes], { type: "application/pdf" });
      const name = `${stripExt(file.name)}-ไม่มีชั้นทับ.pdf`;
      results.innerHTML = "";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, `${fmtBytes(file.size)} เป็น ${fmtBytes(blob.size)}`)]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",
          label: tr(`ดาวน์โหลด ${name}`, `Download ${name}`), onclick: () => download(blob, name) }),
      ]));
      st.ok(off
        ? tr(`เอาออกแล้ว ${off} ชั้น จาก ${pageCount} หน้า`, `Removed ${pl(off, "layer", "layers")} across ${pl(pageCount, "page", "pages")}`)
        : tr("ยังไม่ได้ติ๊กชั้นไหนออก ไฟล์เหมือนเดิมทุกอย่าง", "No layer unticked, the file is unchanged"));
    } catch (e) {
      st.err(tr("บันทึกไม่สำเร็จ: ", "Could not save: ") + e.message);
    } finally { st.end(); go.disabled = false; }
  }

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF file"), node: el("div", { class: "us-left" }, [dz.container]) },
    center: { node: stage, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อดูชั้นที่ทับอยู่", "No file yet. Choose a PDF to see the layers on top") },
    right: { title: tr("ชั้นบนหน้า", "Layers"), node: rightBody },
    toolbar: [nav],
    footer: [st.node, go],
  });
  ws.showCanvas(false);
  ws.body.appendChild(results);
  ws.body.appendChild(el("div", { class: "note" },
    tr("ตัดทั้งชั้นเท่านั้น เนื้อหาจึงไม่หายเอง  ลายน้ำที่ปนกับข้อความ หรืออบเป็นภาพแล้ว เอาออกไม่ได้",
       "Whole layers only, so content is never lost. A stamp drawn into the text, or flattened into an image, cannot be removed")));

  registerCleanup(ws.wrap, {
    sleep: () => { ready = false; groups = []; },
    hasFiles: () => !!file,
  });
  return ws.wrap;
}
