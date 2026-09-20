import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton, stripExt, parsePages, yieldToBrowser, fmtBytes, stashFiles } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr, pl } from "../i18n.js";

/* ‼️ ไฟล์ไหนเป็นของใคร บอกด้วย "ตัวอักษร" ไม่ใช่ "สี" (ตัดสินจากการวัดจริง 18/09/2026)
   ลองชุดสี 4 แบบแล้ววัดด้วย src/cvd.js ไม่มีชุดไหนที่ 5 สีขึ้นไปแยกออกครบทั้งสามแบบตาบอดสี
   ชุดที่ดีที่สุดยังเหลือคู่ที่ห่างกันแค่ 4.9 ซึ่งต่ำกว่าเกณฑ์ 10 ของโปรเจกต์
   จึงให้ตัวอักษร A B C เป็นตัวบอกจริง ส่วนสีเป็นแค่ตัวช่วยให้กวาดตาเร็ว
   ชุดสีนี้ค้นครบทุกคู่จากผู้สมัคร 18 สี ได้ระยะห่างตาปกติน้อยสุด 27.3 */
const FILE_COLORS = ["#e8613c", "#0e8ba8", "#2f9e63", "#c9a227", "#b0355f", "#7c3aed"];
const colorOf = (fi) => FILE_COLORS[fi % FILE_COLORS.length];
// A..Z แล้ววนเป็น A2 B2 ถ้าไฟล์เกิน 26 ตัว (ไม่จำกัดจำนวนไฟล์)
const tagOf = (fi) => String.fromCharCode(65 + (fi % 26)) + (fi >= 26 ? String(Math.floor(fi / 26) + 1) : "");

// สไตล์เสริมเฉพาะหน้านี้ — ห้ามแก้ assets/css/tool.css จึงฝังไว้ในโมดูลแทน
const STYLE = `
.pp-left{display:flex;flex-direction:column;gap:10px}
/* ‼️ มีที่มากขึ้นแล้วจากการเลิกใช้แผงขวา จึงตั้งการ์ดขั้นต่ำให้ใหญ่ขึ้นด้วย
   ที่ 210px บนพื้นที่ราว 1060px จะได้ 4 คอลัมน์ การ์ดกว้างราว 255px
   ซึ่งใหญ่กว่าเดิมที่ได้ 3 คอลัมน์ 215px ทั้งที่เห็นหน้าได้มากกว่า */
@media (min-width:1100px){ .pages{ grid-template-columns:repeat(auto-fill,minmax(210px,1fr)) } }
.pp-stats{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
.pp-stats b{color:var(--text);font-variant-numeric:tabular-nums}
.pp-quick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:5px}
.pp-chip{border:1.5px solid var(--line);background:var(--bg-soft);color:var(--text);
  border-radius:999px;padding:6px 11px;font:500 12.5px/1.4 var(--font);cursor:pointer;min-height:36px;
  transition:border-color .12s var(--ease-snap,ease),background .12s var(--ease-snap,ease)}
.pp-chip:hover:not(:disabled){border-color:color-mix(in srgb,var(--g-pdf,var(--brand)) 45%,var(--line))}
.pp-chip:disabled{opacity:.45;cursor:default}
/* จอกว้าง+เมาส์ ชิปแน่นได้อีก นิ้วสัมผัสยังได้ 36px เท่าเดิม */
@media (min-width:1001px) and (pointer:fine){ .pp-chip{padding:4px 10px;min-height:29px} }
.pp-quick-hint{display:block;color:var(--text-mute);font-size:11.5px;line-height:1.5;margin-bottom:6px}
.pg.selected{outline:2px solid var(--ac,var(--brand));outline-offset:2px}
/* แถบสีประจำไฟล์บนการ์ดหน้า กับป้ายตัวอักษรที่เป็นตัวบอกจริง */
.pg{position:relative}
.pg.multi{border-top:3px solid var(--fc,transparent)}
.pg .src{position:absolute;inset-block-start:5px;inset-inline-start:5px;z-index:2;
  min-width:19px;height:19px;padding:0 5px;border-radius:5px;background:var(--fc,#666);
  color:#fff;font-size:11px;font-weight:700;line-height:19px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.35)}
/* ‼️ ป้าย A B C ไปเกาะกับรายการไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว ไม่ทำรายการใหม่
   เคยทำรายการแยกของตัวเอง แล้วชื่อไฟล์ขึ้นสองที่ซ้ำกันบนหน้าจอเดียว รกโดยไม่ได้อะไรเพิ่ม */
/* ‼️ ป้ายต้อง "ลอยทับ" ไม่ใช่แทรกเป็นช่องใหม่ในแถว
   เคยแทรกเป็นช่องปกติ แล้วแถวแคบลงจนขนาดไฟล์ตกบรรทัดเป็น "2.3" กับ "KB" คนละบรรทัด
   และชื่อไฟล์โดนตัดเร็วขึ้นจนอ่านไม่ออกว่าไฟล์ไหน */
.pp-has-tag{position:relative}
.pp-tag{position:absolute;inset-block-start:3px;inset-inline-start:3px;z-index:2;
  min-width:17px;height:17px;padding:0 4px;border-radius:5px;
  background:var(--fc,#666);color:#fff;font-size:10.5px;font-weight:700;line-height:17px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.3)}
`;

export function mount(tool) {
  const st = statusBar();
  const pagesGrid = el("div", { class: "pages" });
  const extra = el("div", {}); // ที่อยู่กล่องขอรหัสผ่านไฟล์ล็อก
  const results = el("div", { class: "results" });
  const summary = el("div", { class: "pp-stats" }, tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"));
  let files = [];
  let items = []; // {fi, index, rotate, dropped, thumb}
  let selected = null; // อ้างถึงสมาชิกใน items ที่กำลังเลือกอยู่ (ไม่ใช่ index กันหลุดตอนลากสลับ)

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    accept: "application/pdf,.pdf", multiple: true, reorder: true,
    hint: tr("หลายไฟล์ได้ ลากสลับลำดับไฟล์ได้", "Multiple files, drag to reorder"),
    onChange: (f) => {
      const next = [...(f || [])];
      results.innerHTML = "";
      /* ‼️ สลับลำดับไฟล์ ไม่ต้องเรนเดอร์ภาพใหม่ (18/09/2026)
         กล่องเลือกไฟล์แจ้ง onChange ทุกครั้งที่ลากสลับ ถ้าเรนเดอร์ใหม่ทุกครั้ง
         ไฟล์ 14 หน้า 3.7 MB จะรอหลายวินาทีต่อการลากหนึ่งครั้ง ซึ่งใช้งานไม่ไหว
         ถ้าเป็นชุดไฟล์เดิมแค่สลับที่ ให้ย้ายภาพที่มีอยู่แล้วตามไป พร้อมแก้เลขไฟล์ต้นทาง */
      const sameSet = next.length === files.length && next.length > 0
        && next.every((x) => files.includes(x));
      if (sameSet && items.length) {
        const order = next.map((x) => files.indexOf(x));   // ตำแหน่งใหม่ -> ตำแหน่งเดิม
        const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
        items.forEach((it) => { it.fi = remap.get(it.fi); });
        items.sort((a, b) => (a.fi - b.fi) || (a.index - b.index));
        files = next;
        renderFiles();
        render();
        st.ok(tr("สลับลำดับไฟล์แล้ว หน้าเรียงตามไฟล์ใหม่", "Files reordered, pages regrouped"));
        return;
      }
      /* ‼️ เพิ่มไฟล์เข้ามาใหม่ โดยไฟล์เดิมยังอยู่ครบและเรียงเหมือนเดิม
         ต้องเก็บงานที่จัดไว้ทั้งหมด (หน้าที่ลบ การหมุน การครอบ หน้าว่าง) แล้วอ่านเฉพาะไฟล์ใหม่
         เดิมเรียก loadPreview() ซึ่งล้าง items ทิ้งหมด คนจัด 26 หน้าแล้วเพิ่มไฟล์ = เสียงานทั้งชุด
         และแทรกต่อจากหน้าที่เลือกอยู่ ได้ "เพิ่มเอกสารตรงนี้" ไปในตัว */
      const added = files.length > 0 && next.length > files.length
        && files.every((f, i) => next[i] === f);
      if (added && items.length) {
        const from = files.length;
        files = next;
        loadPreview({ fromFile: from, insertAfter: selected });
        return;
      }
      files = next;
      if (files.length) loadPreview();
      else { items = []; selected = null; pagesGrid.innerHTML = ""; st.clear(); setLoaded(false); renderFiles(); updateSummary(); ws.showCanvas(false); }
    },
  });

  // ── แผงซ้าย: เลือกไฟล์ + รายชื่อไฟล์ + สรุปจำนวนหน้า ─────────────────
  const leftNode = el("div", { class: "pp-left" }, [dz.container, extra, summary]);
  // ตัวเลือกย้ายมาต่อท้ายแผงซ้ายตอนสร้างเสร็จ ดูหมายเหตุที่ rightNode

  // ── แถบเครื่องมือลอย: ทำงานกับหน้าที่เลือกอยู่ ──────────────────────
  const rotateLBtn = button("", { icon: "rotateL", ghost: true, label: tr("หมุนซ้าย", "Rotate left"), onclick: () => rotateSelected(270) });
  const rotateRBtn = button("", { icon: "rotateR", ghost: true, label: tr("หมุนขวา", "Rotate right"), onclick: () => rotateSelected(90) });
  const toggleBtn = button("", { icon: "trash", ghost: true, label: tr("ลบ/เอากลับ", "Remove/restore"), onclick: toggleSelected });
  const cropBtn = button(tr("ครอบขอบขาว", "Trim white edge"), { ghost: true,
    label: tr("ครอบขอบขาวของหน้าที่เลือก", "Trim the white edge of the selected page"), onclick: () => autoCrop(false) });
  const cropAllBtn = button(tr("ครอบทุกหน้า", "Trim every page"), { ghost: true, onclick: () => autoCrop(true) });
  const blankBtn = button(tr("+ หน้าว่าง", "+ Blank page"), { ghost: true,
    label: tr("เพิ่มหน้าว่างต่อจากหน้าที่เลือก", "Add a blank page after the selected one"), onclick: addBlank });
  /* ‼️ ทางลัดไปเครื่องมือลบ/พิมพ์ข้อความ พร้อมพาไฟล์ไปด้วย
     ทั้งสองตัวโหลดไลบรารีชุดเดียวกัน (pdfjs + pdflib) การข้ามไปมาจึงไม่โหลดอะไรเพิ่ม
     เย็บรอยต่อให้เนียน ดีกว่ายัดหน้าจอแก้ข้อความทีละหน้าเข้ามาในกระดานจัดการหลายไฟล์ */
  const editTextBtn = button(tr("แก้ข้อความบนหน้า", "Edit text on a page"), { ghost: true,
    label: tr("ไปเครื่องมือแก้ข้อความ พาไฟล์นี้ไปด้วย", "Go to the text editor, taking this file along"),
    onclick: () => {
      if (!files.length) return;
      stashFiles(files);
      location.hash = "#/pdf-edit";
    } });
  const resetBtn = button(tr("รีเซ็ตทั้งหมด", "Reset all"), { icon: "undo", ghost: true, onclick: () => { if (files.length) loadPreview(); } });
  [rotateLBtn, rotateRBtn, toggleBtn, cropBtn, cropAllBtn, blankBtn, editTextBtn, resetBtn].forEach((b) => { b.disabled = true; });

  // ── แผงขวา: เก็บเฉพาะบางหน้า + วิธีเรียงเมื่อมีหลายไฟล์ ───────────────
  const rangeInput = el("input", { type: "text", placeholder: tr("เช่น 1-3,5,8-", "e.g. 1-3,5,8-"), disabled: true });
  const rangeBtn = button(tr("ใช้ช่วงนี้", "Apply range"), { ghost: true, onclick: applyRange });
  rangeBtn.disabled = true;
  const byFileBtn = button(tr("เรียงทีละไฟล์", "Group by file"), { ghost: true, onclick: () => reorder("byfile") });
  const zipBtn = button(tr("สลับไฟล์ทีละหน้า", "Interleave pages"), { ghost: true, onclick: () => reorder("zip") });
  [byFileBtn, zipBtn].forEach((b) => { b.disabled = true; });
  /* ── ครอบแล้วเอาหน้ากระดาษแบบไหน ──────────────────────────────────────
     ‼️ สองอย่างนี้ขัดกันเชิงเรขาคณิต เลือกได้อย่างเดียว
        เนื้อหาที่ครอบมักกว้างเต็มหน้าอยู่แล้ว เหลือขาวแค่ด้านบนล่าง
        จะให้ "หน้าเท่ากัน" และ "ไม่มีที่ว่าง" พร้อมกันต้องยืดบิดหรือตัดข้างทิ้ง
     ค่าตั้งต้นคือหน้าเท่ากัน เพราะไฟล์ที่หน้าหลายขนาดปนกัน สั่งพิมพ์แล้วเครื่องย่อขยายมั่ว */
  let cropMode = "same";
  const sameBtn = button(tr("หน้าเท่ากันทุกหน้า", "Same page size"), { ghost: true,
    onclick: () => setCropMode("same") });
  const tightBtn = button(tr("ตัดหน้าให้พอดีเนื้อหา", "Page hugs the content"), { ghost: true,
    onclick: () => setCropMode("tight") });
  function setCropMode(m) {
    cropMode = m;
    sameBtn.classList.toggle("on", m === "same");
    tightBtn.classList.toggle("on", m === "tight");
    st.info(m === "same"
      ? tr("ทุกหน้าจะได้ขนาดเท่ากัน เนื้อหาที่ครอบจัดกลางหน้า เหลือขอบขาวบ้าง",
           "Every page keeps the same size, trimmed content sits centred with some white margin")
      : tr("หน้ากระดาษจะหดพอดีเนื้อหา ไม่เหลือขอบขาว แต่ไฟล์จะมีหน้าหลายขนาดปนกัน",
           "The paper shrinks to the content, no white margin, but the file ends up with mixed page sizes"));
    render();
  }
  const cropGroup = el("div", {}, [
    el("h3", {}, tr("ครอบแล้วเอาหน้ากระดาษแบบไหน", "After trimming, what happens to the paper")),
    el("div", { class: "row" }, [sameBtn, tightBtn]),
    el("small", {}, tr("เลือกได้อย่างเดียว เพราะเนื้อหามักกว้างเต็มหน้าอยู่แล้ว จะให้เท่ากันและไม่มีที่ว่างพร้อมกันไม่ได้",
                       "Only one is possible, trimmed content usually already spans the full width")),
  ]);

  const sortGroup = el("div", {}, [
    el("h3", {}, tr("วิธีเรียงเมื่อมีหลายไฟล์", "Order across files")),
    el("div", { class: "row" }, [byFileBtn, zipBtn]),
    el("small", {}, tr("เรียงทีละไฟล์ คือไฟล์ A จนหมดแล้วต่อ B", "Group by file puts all of A, then all of B")),
  ]);
  /* ‼️ ตัวเลือกอยู่แผงซ้าย ไม่ใช่แผงขวา (18/09/2026)
     เดิมมีแผงขวากว้าง 340px เพื่อใส่ของแค่ช่องเดียวกับปุ่มสามปุ่ม
     แต่งานของเครื่องมือนี้คือ "ดูภาพแล้วลากสลับ" พื้นที่ภาพจึงสำคัญที่สุด
     วัดจริงแล้วแผงขวากินไป 340px ทำให้กริดเหลือ 708px ได้แค่ 3 คอลัมน์
     ย้ายมาต่อท้ายแผงซ้ายซึ่งยังมีที่ว่าง แล้วคืนพื้นที่ให้ภาพทั้งหมด */
  /* ‼️ ชิปเลือกเร็ว แทนที่จะให้พิมพ์รูปแบบช่วงหน้าเอง (ถอดจาก openkrua 18/09/2026)
     หน้าใช้งานจริงของเขาไม่ให้ผู้ใช้พิมพ์อะไรเลย ให้กดเลือกจากสิ่งที่เตรียมไว้
     ของเราช่องนี้ต้องรู้ก่อนว่ารูปแบบ 1-3,5,8- แปลว่าอะไร ซึ่งต้องเรียนก่อนใช้
     ชิปพวกนี้คือสิ่งที่คนทำบ่อยที่สุดจริง ๆ กดครั้งเดียวได้เลย ไม่ต้องคิด
     ช่องพิมพ์ยังอยู่ครบสำหรับคนที่ต้องการช่วงเฉพาะเจาะจง */
  const QUICK = [
    { id: "odd",   label: () => tr("หน้าคี่", "Odd pages"),      pick: (n) => range(n).filter((i) => i % 2 === 1) },
    { id: "even",  label: () => tr("หน้าคู่", "Even pages"),     pick: (n) => range(n).filter((i) => i % 2 === 0) },
    { id: "first", label: () => tr("ครึ่งแรก", "First half"),    pick: (n) => range(n).slice(0, Math.ceil(n / 2)) },
    { id: "last",  label: () => tr("ครึ่งหลัง", "Second half"),  pick: (n) => range(n).slice(Math.ceil(n / 2)) },
    { id: "nocover", label: () => tr("ตัดหน้าปก", "Drop cover"), pick: (n) => range(n).slice(1) },
  ];
  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

  const quickWrap = el("div", { class: "pp-quick" }, QUICK.map((q) =>
    el("button", {
      class: "pp-chip", type: "button", disabled: true, "data-q": q.id,
      onclick: () => applyQuick(q),
    }, q.label())));

  function applyQuick(q) {
    if (!items.length) return;
    const keep = new Set(q.pick(items.length));
    items.forEach((it, i) => { it.dropped = !keep.has(i + 1); });
    selected = null;
    rangeInput.value = "";
    render();
    st.ok(tr(`เก็บ ${keep.size} หน้า ตามที่เลือก`, `Keeping ${pl(keep.size, "page", "pages")}`));
  }

  leftNode.append(
    el("div", {}, [
      el("h3", {}, tr("อยากเก็บหน้าไหนไว้บ้าง", "Which pages do you want to keep")),
      quickWrap,
      el("small", { class: "pp-quick-hint" },
        tr("กดเลือกได้เลย หรือพิมพ์ช่วงหน้าเองด้านล่าง", "Tap one, or type a page range below")),
      field("", rangeInput, ""),
      rangeBtn,
    ]),
    sortGroup,
    cropGroup,
  );

  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  saveBtn.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF files"), node: leftNode },
    center: { node: pagesGrid, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อดูตัวอย่าง", "No file yet. Choose a PDF to preview") },
    toolbar: [rotateLBtn, rotateRBtn, toggleBtn, el("div", { class: "sep" }),
              cropBtn, cropAllBtn, blankBtn, el("div", { class: "sep" }), editTextBtn, resetBtn],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(
    results,
    el("div", { class: "note" },
      // ‼️ เครื่องมือนี้สร้างไฟล์ใหม่แล้วคัดลอกหน้าที่เก็บเข้าไป สารบัญ/บุ๊กมาร์กของไฟล์เดิม
      //    จึงไม่ติดมาด้วย แม้ผู้ใช้จะไม่ได้แก้อะไรเลย · บอกไว้ตรง ๆ เหมือนที่ pdf-merge บอก
      tr("คลิกหน้าเพื่อเลือก ลากเพื่อสลับลำดับ หรือพิมพ์ช่วงหน้าด้านขวาเพื่อเก็บเฉพาะบางหน้า",
         "Click a page to select, drag to reorder, or type a range on the right to keep pages")),
    // แยกเป็นอีกก้อนเพราะข้อความบนหน้าจอก้อนเดียวห้ามยาวเกิน 100 ตัวอักษร (มีเทสจับ)
    el("div", { class: "note" },
      tr("ใส่หลายไฟล์ได้ ป้าย A B C บอกว่าหน้านั้นมาจากไฟล์ไหน",
         "Multiple files welcome. The A B C tag shows which file a page came from")),
    el("div", { class: "note" },
      tr("ไฟล์ที่ได้จะไม่มีสารบัญ/บุ๊กมาร์กของไฟล์เดิมติดมา",
         "The result will not carry over the original bookmarks")),
    /* ‼️ พี่ปอนด์เปิดหน้านี้แล้วถามว่า "ไหนถ้าพี่จะลบพวกข้อความ" (18/09/2026)
       เครื่องมือนี้ลบได้แค่ทั้งหน้า ส่วนการลบข้อความบนหน้าอยู่คนละตัว
       ชื่อสองอันใกล้กันมากจนคนเข้ามาผิดตัวเป็นเรื่องปกติ จึงชี้ทางให้เห็นตั้งแต่แรก
       ไม่ใช่รอให้ไปเจอเองตอนทำงานเสร็จแล้ว */
    el("div", { class: "note" }, [
      tr("อยากลบเฉพาะข้อความบนหน้า เช่นแก้วันที่ ใช้ ",
         "To remove just some text on a page, such as a date, use "),
      /* ‼️ ต้องพาไฟล์ไปด้วย ไม่งั้นคนที่เข้ามาผิดตัวต้องไปเลือกไฟล์ใหม่อีกรอบ
         การ์ด "ทำอะไรต่อดี" ท้ายหน้าทำแบบนี้อยู่แล้ว ลิงก์นี้เคยตกหล่น (เจอจริง 18/09/2026) */
      el("a", { href: "#/pdf-edit",
        onclick: () => { if (files.length) stashFiles(files); } },
        tr("แก้ไขข้อความบน PDF", "Edit text on a PDF")),
    ]),
  );
  ws.showCanvas(false);

  function setLoaded(on) {
    rangeInput.disabled = !on;
    rangeBtn.disabled = !on;
    quickWrap.querySelectorAll(".pp-chip").forEach((b) => { b.disabled = !on; });
    saveBtn.disabled = !on;
    resetBtn.disabled = !on;
    // ปุ่มเรียงมีความหมายเฉพาะตอนมีมากกว่าหนึ่งไฟล์
    const many = on && files.length > 1;
    byFileBtn.disabled = !many;
    zipBtn.disabled = !many;
    sortGroup.hidden = !many;
  }

  /* ติดป้าย A B C กับแถวไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว
     ‼️ กล่องเลือกไฟล์วาดแถวใหม่ทุกครั้งที่ไฟล์เปลี่ยน ป้ายจึงหายไปด้วย
        ต้องติดใหม่หลังทุกครั้งที่รายการเปลี่ยน ไม่ใช่ติดครั้งเดียวตอนเริ่ม */
  function renderFiles() {
    const rows = leftNode.querySelectorAll(".file-row");
    rows.forEach((row, i) => {
      row.querySelector(".pp-tag")?.remove();
      row.classList.remove("pp-has-tag");
      if (files.length < 2) return;   // ไฟล์เดียวไม่ต้องมีป้าย ไม่มีอะไรให้แยก
      row.classList.add("pp-has-tag");
      row.prepend(el("span", { class: "pp-tag", style: { "--fc": colorOf(i) } }, tagOf(i)));
    });
  }

  function updateSummary() {
    if (!items.length) { summary.textContent = tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"); return; }
    const keep = items.filter((i) => !i.dropped).length;
    summary.innerHTML = "";
    summary.append(el("div", {}, [
      tr("ทั้งหมด ", "Total "), el("b", {}, String(items.length)), tr(" หน้า, เก็บ ", " pages, keep "),
      el("b", {}, String(keep)), tr(", ลบ ", ", remove "), el("b", {}, String(items.length - keep)),
    ]));
  }

  /** @param opts {fromFile} อ่านเฉพาะไฟล์ตั้งแต่ตำแหน่งนี้ไป (ไม่ล้างของเดิม)
   *              {insertAfter} แทรกหน้าใหม่ต่อจากรายการนี้ ไม่ใส่ = ต่อท้าย */
  async function loadPreview(opts = {}) {
    const startFile = opts.fromFile || 0;
    const keepOld = startFile > 0;
    const fresh = [];
    results.innerHTML = "";
    if (!keepOld) {
      pagesGrid.innerHTML = "";
      items = [];
      selected = null;
      setLoaded(false);
      ws.showCanvas(false);
    }
    renderFiles();
    updateSummary();
    st.info(tr("กำลังสร้างภาพตัวอย่าง…", "Generating page previews…"));
    ws.setBusy(true);
    try {
      /* ‼️ นับหน้ารวมไว้ก่อนไม่ได้ ต้องเปิดไฟล์ถึงจะรู้ว่ากี่หน้า
         จึงรายงานความคืบหน้าเป็น "ไฟล์ที่เท่าไหร่ หน้าที่เท่าไหร่" แทนเปอร์เซ็นต์รวม */
      for (let fi = startFile; fi < files.length; fi++) {
        const pdf = await openPdf(files[fi], passwordBox(extra));
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          page.cleanup();
          /* ‼️ เก็บขนาดหน้าจริง (pt) ไว้ด้วย ใช้ตอนสร้างหน้าว่างให้ขนาดเท่าหน้าข้าง ๆ
             viewport ที่ scale 0.35 จึงต้องหารกลับ ไม่งั้นได้หน้าว่างเล็กกว่าเพื่อน 3 เท่า */
          const base = page.getViewport({ scale: 1 });
          (keepOld ? fresh : items).push({ fi, index: p - 1, rotate: 0, dropped: false, crop: null,
            pw: Math.round(base.width), ph: Math.round(base.height),
            thumb: canvas.toDataURL("image/jpeg", 0.7) });
          canvas.width = canvas.height = 0;
          st.progress((p / pdf.numPages) * 100,
            files.length > 1 ? `${tagOf(fi)} (${p}/${pdf.numPages})` : `(${p}/${pdf.numPages})`);
          await yieldToBrowser();
        }
        pdf.destroy();
      }
      /* ‼️ แทรกหน้าใหม่ต่อจากหน้าที่ผู้ใช้เลือกไว้ตอนกดเพิ่มไฟล์ ไม่ใช่ต่อท้ายเสมอ
         หาตำแหน่งด้วย indexOf ตอนนี้ ไม่ใช่จำเลขไว้ตั้งแต่ต้น เพราะระหว่างอ่านไฟล์
         (ซึ่งกินเวลาหลายวินาที) ผู้ใช้อาจลากสลับหน้าไปแล้ว เลขเดิมจะชี้ผิดที่ */
      if (keepOld && fresh.length) {
        const at = opts.insertAfter ? items.indexOf(opts.insertAfter) + 1 : items.length;
        items.splice(at > 0 ? at : items.length, 0, ...fresh);
        selected = null;
      }
      ws.setBusy(false);
      st.progress(null);
      st.ok(keepOld
        ? tr(`แทรกอีก ${fresh.length} หน้าแล้ว รวม ${items.length} หน้า`,
             `Inserted ${pl(fresh.length, "page", "pages")}, ${items.length} total`)
        : tr(`โหลดแล้ว ${items.length} หน้า`, `Loaded ${pl(items.length, "page", "pages")}`));
      setLoaded(true);
      ws.showCanvas(true);
      renderFiles();
      render();
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
      updateSummary();
    }
  }

  function render() {
    const many = files.length > 1;
    pagesGrid.innerHTML = "";
    items.forEach((it, i) => {
      const srcLabel = tr(`ไฟล์ ${tagOf(it.fi)}`, `File ${tagOf(it.fi)}`);
      const card = el("div", {
        class: "pg" + (many ? " multi" : "") + (it.dropped ? " dropped" : "") + (it === selected ? " selected" : ""),
        style: many ? { "--fc": colorOf(it.fi) } : null,
        draggable: "true", "data-i": i, tabindex: "0", role: "button",
        "aria-pressed": it === selected ? "true" : "false",
        "aria-label": tr(`หน้า ${i + 1}${many ? " จาก" + srcLabel : ""}${it.dropped ? " (ทำเครื่องหมายลบไว้)" : ""}`,
                         `Page ${i + 1}${many ? " from " + srcLabel : ""}${it.dropped ? " (marked for removal)" : ""}`),
        onclick: () => { selectItem(it === selected ? null : it); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(it === selected ? null : it); } },
      }, [
        many && !it.blank ? el("span", { class: "src", title: `${srcLabel}: ${files[it.fi].name}` }, tagOf(it.fi)) : null,
        /* หน้าว่างไม่มีภาพย่อ วาดเป็นกระดาษเปล่าพร้อมป้ายบอก จะได้ไม่คิดว่าโหลดไม่ขึ้น */
        it.blank
          ? el("div", { class: "pg-blank", style: { aspectRatio: `${it.pw} / ${it.ph}` } },
               tr("หน้าว่าง", "Blank page"))
          : it.crop
            /* ‼️ กล่องครอบ สัดส่วนเท่ากรอบที่เก็บไว้จริง แล้วขยายภาพให้เฉพาะส่วนนั้นเต็มกล่อง
               เดิมใช้ clip-path ซึ่งตัดภาพแต่ไม่หดกล่อง การ์ดเลยเหลือที่ว่างข้างล่าง
               = พรีวิวไม่ตรงกับไฟล์จริงที่ครอบไปแล้ว (พี่ปอนด์ทักเอง 18/09/2026)
               ‼️ หมุนที่กล่อง ไม่ใช่ที่ภาพ ไม่งั้นภาพจะหมุนอยู่ในกรอบที่ไม่หมุนตาม */
            ? (() => {
                /* หน้ากระดาษยังขนาดเดิม แต่เนื้อหาที่ครอบถูกขยายจัดกลาง (รักษาสัดส่วน)
                   ตรงกับที่ไฟล์จริงทำด้วย embedPage + drawPage ทุกประการ */
                const pageAR = it.pw / it.ph;
                const cropAR = (it.pw * it.crop.w) / (it.ph * it.crop.h);
                /* โหมด "พอดีเนื้อหา" การ์ดหดตามกรอบที่ครอบ ไม่มีกระดาษขาวเหลือ
                   ต้องให้พรีวิวต่างกันตามโหมด ไม่งั้นพรีวิวโกหกอีกแบบหนึ่ง */
                if (cropMode === "tight") {
                  return el("div", { class: "pg-page",
                    style: { aspectRatio: `${it.pw * it.crop.w} / ${it.ph * it.crop.h}`,
                             transform: `rotate(${it.rotate}deg)` } }, [
                    el("div", { class: "pg-crop", style: { inset: "0" } }, [
                      el("img", { src: it.thumb, loading: "lazy",
                        alt: tr(`หน้า ${it.index + 1} (ครอบแล้ว)`, `Page ${it.index + 1}, trimmed`),
                        style: { width: `${100 / it.crop.w}%`, height: `${100 / it.crop.h}%`,
                                 insetInlineStart: `${-(it.crop.x / it.crop.w) * 100}%`,
                                 top: `${-(it.crop.y / it.crop.h) * 100}%` } }),
                    ]),
                  ]);
                }
                // ขยายให้พอดีด้านที่ตึงกว่า อีกด้านเหลือขอบเท่า ๆ กันสองข้าง
                const fitW = cropAR >= pageAR;              // เนื้อหาแบนกว่าหน้า -> ชนซ้ายขวา
                const vw = fitW ? 100 : (cropAR / pageAR) * 100;   // กว้างของกรอบเนื้อหา (% ของการ์ด)
                const vh = fitW ? (pageAR / cropAR) * 100 : 100;
                return el("div", { class: "pg-page",
                  style: { aspectRatio: `${it.pw} / ${it.ph}`, transform: `rotate(${it.rotate}deg)` } }, [
                  el("div", { class: "pg-crop",
                    style: { width: `${vw}%`, height: `${vh}%`,
                             insetInlineStart: `${(100 - vw) / 2}%`, top: `${(100 - vh) / 2}%` } }, [
                    el("img", { src: it.thumb, loading: "lazy",
                      alt: tr(`หน้า ${it.index + 1} (ครอบแล้ว)`, `Page ${it.index + 1}, trimmed`),
                      style: { width: `${100 / it.crop.w}%`, height: `${100 / it.crop.h}%`,
                               insetInlineStart: `${-(it.crop.x / it.crop.w) * 100}%`,
                               top: `${-(it.crop.y / it.crop.h) * 100}%` } }),
                  ]),
                ]);
              })()
            : el("img", { src: it.thumb, alt: tr(`หน้า ${it.index + 1}`, `Page ${it.index + 1}`), loading: "lazy",
              style: { transform: `rotate(${it.rotate}deg)` } }),
        el("span", { class: "num" }, String(i + 1)),
        it.crop ? el("span", { class: "pg-cropped", title: tr("ครอบขอบขาวไว้", "White edge trimmed") },
                     tr("ครอบแล้ว", "trimmed")) : null,
        el("div", { class: "tools" }, [
          el("button", { type: "button",
            title: tr(`หมุนซ้าย (หน้า ${i + 1})`, `Rotate left (page ${i + 1})`),
            "aria-label": tr(`หมุนหน้า ${i + 1} ไปทางซ้าย`, `Rotate page ${i + 1} left`),
            onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 270) % 360; render(); } }, [uiIcon("rotateL", "pg-ico")]),
          el("button", { type: "button",
            title: tr(`หมุนขวา (หน้า ${i + 1})`, `Rotate right (page ${i + 1})`),
            "aria-label": tr(`หมุนหน้า ${i + 1} ไปทางขวา`, `Rotate page ${i + 1} right`),
            onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 90) % 360; render(); } }, [uiIcon("rotateR", "pg-ico")]),
          el("button", { type: "button",
            title: it.dropped ? tr(`เอากลับ (หน้า ${i + 1})`, `Restore page ${i + 1}`) : tr(`ลบหน้านี้ (หน้า ${i + 1})`, `Remove page ${i + 1}`),
            "aria-label": it.dropped ? tr(`เอาหน้า ${i + 1} กลับ`, `Restore page ${i + 1}`) : tr(`ลบหน้า ${i + 1}`, `Delete page ${i + 1}`),
            onclick: (e) => { e.stopPropagation(); it.dropped = !it.dropped; render(); } }, [uiIcon(it.dropped ? "undo" : "trash", "pg-ico")]),
        ]),
      ]);
      pagesGrid.appendChild(card);
    });
    updateSummary();
    st.info(tr(`เหลือ ${items.filter((i) => !i.dropped).length}/${items.length} หน้า`,
                `${items.filter((i) => !i.dropped).length}/${pl(items.length, "page", "pages")} left`));
    syncToolbar();
  }

  /* เรียงใหม่ 2 แบบ
     byfile = ไฟล์ A จนหมดแล้วต่อ B ซึ่งเป็นลำดับเดิมตอนโหลดเข้ามา
     zip    = หน้าแรกของทุกไฟล์ก่อน แล้วค่อยหน้าสอง ใช้ตอนสแกนหน้าหน้ากับหลังแยกไฟล์กันมา */
  function reorder(mode) {
    if (items.length < 2) return;
    const byFile = new Map();
    items.forEach((it) => {
      if (!byFile.has(it.fi)) byFile.set(it.fi, []);
      byFile.get(it.fi).push(it);
    });
    const groups = [...byFile.keys()].sort((a, b) => a - b).map((k) => byFile.get(k));
    if (mode === "byfile") {
      items = groups.flat();
      st.ok(tr("เรียงทีละไฟล์แล้ว", "Grouped by file"));
    } else {
      const out = [];
      const longest = Math.max(...groups.map((g) => g.length));
      for (let i = 0; i < longest; i++) for (const g of groups) if (g[i]) out.push(g[i]);
      items = out;
      st.ok(tr("สลับไฟล์ทีละหน้าแล้ว", "Interleaved across files"));
    }
    render();
  }

  /* ── ครอบตัดขอบขาว ───────────────────────────────────────────────────
     อ่านพิกเซลจากภาพย่อที่เรนเดอร์ไว้แล้ว หากรอบที่ยังมีเนื้อหาอยู่
     ‼️ ใช้ภาพย่อ ไม่เรนเดอร์ใหม่ เพราะภาพย่อมีอยู่แล้วและเร็วกว่ามาก
        ความละเอียดต่ำพอ (scale 0.35) แต่หาขอบกระดาษได้แม่นพอสำหรับงานนี้
     ‼️ เผื่อขอบไว้ 1.5% ของด้าน ไม่งั้นตัวอักษรริมสุดจะถูกเฉือนหัวท้าย */
  const WHITE = 244;          // สว่างกว่านี้ถือว่าเป็นพื้นกระดาษเปล่า
  const MIN_TRIM = 0.06;      // ตัดได้น้อยกว่านี้ ถือว่าหน้านี้เต็มอยู่แล้ว ไม่ต้องยุ่ง

  function findContentBox(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    if (!c.width || !c.height) return null;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let d;
    try { d = ctx.getImageData(0, 0, c.width, c.height).data; }
    catch { return null; }                       // ภาพข้ามโดเมน อ่านพิกเซลไม่ได้
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;                     // ทั้งหน้าเป็นสีขาว ไม่มีอะไรให้ครอบ

    /* ‼️ หัวใจของวิธีนี้: เก็บ "ขอบที่แคบที่สุด" ไว้เท่ากันทุกด้าน แล้วตัดเฉพาะส่วนที่เกิน
       เอกสารทั่วไปมีขอบกระดาษเป็นเรื่องปกติ ถ้าตัดขอบขาวจนหมดตัวหนังสือจะชิดขอบ
       หน้าปกติขอบ 40/40/40/42 -> ขอบแคบสุด 40 -> กรอบขยายกลับเต็มหน้า = ไม่ครอบ
       หน้าสแกนสั้นขอบ 40/40/40/442 -> เหลือขอบล่าง 40 ตัดส่วนเกินออก 400 */
    const pad = Math.min(x0, y0, c.width - 1 - x1, c.height - 1 - y1);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const box = { x: x0 / c.width, y: y0 / c.height,
                  w: (x1 - x0 + 1) / c.width, h: (y1 - y0 + 1) / c.height };
    // ตัดได้น้อยกว่า MIN_TRIM ของทั้งสองด้าน ถือว่าหน้านี้เต็มอยู่แล้ว
    const trimmed = (1 - box.w) + (1 - box.h);
    return trimmed < MIN_TRIM ? null : box;
  }

  /** ‼️ ภาพย่อเป็น data URL ต้องรอ decode ให้เสร็จก่อนอ่านพิกเซล
      img.complete เป็น false เสมอตอนเพิ่งตั้ง src ถ้าไม่รอจะได้ null ทุกหน้าโดยไม่มี error */
  function loadImg(src) {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
  }

  /** ครอบตัดหน้าที่เลือก หรือทุกหน้าที่ยังไม่ถูกลบ */
  async function autoCrop(all) {
    const targets = all ? items.filter((i) => !i.dropped && !i.blank)
                        : (selected && !selected.blank ? [selected] : []);
    if (!targets.length) return st.err(tr("เลือกหน้าก่อน", "Pick a page first"));
    let done = 0, already = 0;
    for (const it of targets) {
      if (it.crop) { it.crop = null; continue; }   // กดซ้ำ = เอาการครอบออก
      const img = await loadImg(it.thumb);
      const box = img ? findContentBox(img) : null;
      if (box) { it.crop = box; done++; } else already++;
    }
    render();
    if (done) st.ok(tr(`ครอบขอบขาวแล้ว ${done} หน้า`, `Trimmed ${pl(done, "page", "pages")}`));
    else if (already) st.info(tr("หน้านี้เต็มกระดาษอยู่แล้ว ไม่มีขอบขาวให้ตัด",
                                 "This page already fills the paper, no white edge to trim"));
    else st.ok(tr("เอาการครอบออกแล้ว", "Crop removed"));
  }

  /* ── หน้าว่าง ─────────────────────────────────────────────────────────
     ขนาดเท่าหน้าที่เลือกอยู่ ถ้าไม่ได้เลือกใช้ขนาดหน้าแรก ไม่มีเลยใช้ A4 */
  function addBlank() {
    const ref = selected || items.find((i) => !i.blank) || null;
    const blank = { blank: true, rotate: 0, dropped: false, crop: null,
                    pw: ref ? ref.pw : 595, ph: ref ? ref.ph : 842 };
    const at = selected ? items.indexOf(selected) + 1 : items.length;
    items.splice(at, 0, blank);
    selected = blank;
    render();
    st.ok(tr(`เพิ่มหน้าว่างที่ตำแหน่ง ${at + 1}`, `Blank page added at position ${at + 1}`));
  }

  function selectItem(it) {
    selected = it;
    render();
  }

  function rotateSelected(delta) {
    if (!selected) return;
    selected.rotate = (selected.rotate + delta) % 360;
    render();
  }

  function toggleSelected() {
    if (!selected) return;
    selected.dropped = !selected.dropped;
    render();
  }

  function syncToolbar() {
    const has = !!selected;
    cropBtn.disabled = !has || !!(selected && selected.blank);
    cropAllBtn.disabled = !items.length;
    blankBtn.disabled = !items.length;
    editTextBtn.disabled = !files.length;
    rotateLBtn.disabled = !has;
    rotateRBtn.disabled = !has;
    toggleBtn.disabled = !has;
    toggleBtn.replaceChildren(uiIcon(has && selected.dropped ? "undo" : "trash", "btn-ico"));
    // ‼️ ใช้ ariaLabel อย่างเดียว เว็บนี้ไม่ใช้ tooltip ของเบราว์เซอร์
    toggleBtn.ariaLabel = has && selected.dropped ? tr("เอากลับ", "Restore") : tr("ลบหน้านี้", "Remove this page");
  }

  function applyRange() {
    if (!items.length) return;
    let pages;
    try { pages = parsePages(rangeInput.value, items.length); }
    catch (e) { st.err(e.message); return; }
    if (!pages.length) { st.err(tr("ไม่พบเลขหน้าที่ถูกต้องในช่วงที่พิมพ์", "No valid page numbers found in what you typed")); return; }
    const keepSet = new Set(pages.map((p) => p - 1));
    items.forEach((it, i) => { it.dropped = !keepSet.has(i); });
    selected = null;
    render();
    st.ok(tr(`ตั้งช่วง ${rangeInput.value} (${pages.length} หน้า)`,
             `Set range ${rangeInput.value} (${pl(pages.length, "page", "pages")})`));
  }

  let dragging = null;
  pagesGrid.addEventListener("dragstart", (e) => {
    dragging = e.target.closest(".pg");
    dragging?.classList.add("dragging");
    pagesGrid.classList.add("is-dragging");
  });
  pagesGrid.addEventListener("dragend", () => {
    pagesGrid.querySelectorAll(".pg").forEach((n) => n.classList.remove("dragging", "over", "after"));
    pagesGrid.classList.remove("is-dragging");
    dragging = null;
  });
  /* ‼️ ต้องรู้ว่าจะแทรก "ก่อน" หรือ "หลัง" ใบที่ชี้อยู่ ไม่ใช่แค่ชี้โดน
     ตัดสินจากตำแหน่งเมาส์เทียบกับกึ่งกลางใบนั้น แล้วขีดเส้นฝั่งที่ตรงกัน
     ไม่งั้นผู้ใช้ลากไปวางแล้วผลไม่ตรงกับที่เห็น ซึ่งคือที่พี่ปอนด์บอกว่าไม่รู้ว่าเปลี่ยนไหม */
  const dropSide = (e, node) => {
    const r = node.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2 ? "after" : "before";
  };
  pagesGrid.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(".pg");
    if (!over || over === dragging) return;
    pagesGrid.querySelectorAll(".pg").forEach((n) => n.classList.remove("over", "after"));
    over.classList.add("over");
    if (dropSide(e, over) === "after") over.classList.add("after");
  });
  pagesGrid.addEventListener("drop", (e) => {
    e.preventDefault();
    const over = e.target.closest(".pg");
    if (!over || !dragging) return;
    const from = +dragging.dataset.i;
    let to = +over.dataset.i;
    if (dropSide(e, over) === "after") to += 1;
    if (to > from) to -= 1;          // ถอนของเดิมออกก่อน ตำแหน่งปลายทางจึงเลื่อนมาหนึ่ง
    if (to === from) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    selected = null;
    render();
    st.ok(tr(`ย้ายหน้าไปตำแหน่งที่ ${to + 1} แล้ว`, `Moved to position ${to + 1}`));
  });

  async function save() {
    const keep = items.filter((i) => !i.dropped);
    if (!files.length && !keep.some((k) => k.blank)) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!keep.length) return st.err(tr("ต้องเหลืออย่างน้อย 1 หน้า", "At least 1 page must remain"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, degrees } = PDFLib;
      const out = await PDFDocument.create();
      let encrypted = false, hiddenLayers = false;

      /* ‼️ เปิดแต่ละไฟล์ครั้งเดียวแล้วเก็บไว้ ไม่ใช่เปิดใหม่ทุกหน้า
         ไฟล์ 50 หน้าถ้าเปิดซ้ำทุกหน้าคือถอดรหัสไฟล์เดิม 50 รอบ ช้าโดยไม่จำเป็น
         ‼️ และต้อง copyPages ทีละไฟล์เป็นก้อน แต่ใส่ลงเล่มตามลำดับที่ผู้ใช้จัดไว้
         ถ้าคัดลอกทีละหน้าตามลำดับ จะสลับ src ไปมาซึ่ง pdf-lib ทำงานช้ากว่ามาก */
      const srcDocs = new Map();
      // ‼️ หน้าว่างไม่ได้มาจากไฟล์ไหน ต้องกันออกก่อน ไม่งั้น fi เป็น undefined แล้ว files[undefined] พัง
      for (const fi of new Set(keep.filter((k) => !k.blank).map((k) => k.fi))) {
        const r = await loadPdfLib(files[fi]);
        srcDocs.set(fi, r.doc);
        encrypted = encrypted || r.encrypted;
        hiddenLayers = hiddenLayers || r.hiddenLayers;
      }
      // คัดลอกเป็นก้อนต่อไฟล์ แล้วค่อยเรียงกลับตามตำแหน่งเดิมที่ผู้ใช้จัดไว้
      const copiedAt = new Array(keep.length);
      for (const [fi, doc] of srcDocs) {
        /* ‼️ โหมด "หน้าเท่ากัน" ไม่คัดลอกหน้าที่ครอบมา เพราะจะฝังด้วย embedPage แทน
           แต่โหมด "พอดีเนื้อหา" ต้องคัดลอกมาปกติ เพราะใช้ setCropBox กับหน้าที่คัดลอกแล้ว */
        const skipCrop = cropMode === "same";
        const slots = keep.map((k, i) =>
          (!k.blank && !(skipCrop && k.crop) && k.fi === fi ? i : -1)).filter((i) => i >= 0);
        const pages = await out.copyPages(doc, slots.map((i) => keep[i].index));
        slots.forEach((slot, j) => { copiedAt[slot] = pages[j]; });
      }
      /* ‼️ ต้องวนด้วย index ห้ามใช้ forEach
         ช่องของหน้าว่างไม่เคยถูกกำหนดค่า = เป็น "รู" ในอาร์เรย์ ซึ่ง forEach ข้ามทิ้งเงียบ ๆ
         ผลคือหน้าว่างหายไปจากไฟล์โดยไม่มี error และหน้าจอยังโชว์การ์ดครบ (เจอจริง 18/09/2026) */
      for (let i = 0; i < keep.length; i++) {
        const page = copiedAt[i];
        const it = keep[i];
        if (it.blank) { out.addPage([it.pw, it.ph]); continue; }   // หน้าว่าง สร้างใหม่ตรงนี้

        /* ── หน้าที่ครอบ: ตัดเนื้อหาแล้วขยายให้เต็มหน้ากระดาษขนาดเดิม ─────────
           ‼️ ทำแบบนี้ทุกหน้าในไฟล์จึงมีขนาดเท่ากัน ซึ่งสำคัญตอนสั่งพิมพ์
              ถ้าใช้ setCropBox หน้ากระดาษจะเล็กลงตามเนื้อหา แล้วเครื่องพิมพ์จะย่อขยายมั่ว
           ‼️ พิกัด PDF นับจากมุมล่างซ้าย ส่วนค่าที่เก็บไว้นับจากมุมบนซ้ายแบบภาพ ต้องกลับแกน y
           ‼️ ขยายแบบรักษาสัดส่วน แล้วจัดกลางหน้า ไม่ยืดบิด ไม่งั้นตัวหนังสือเพี้ยน */
        if (it.crop && cropMode === "tight") {
          /* หน้ากระดาษหดพอดีเนื้อหา ใช้ setCropBox ซึ่งไม่แตะพิกเซลเลย ไม่เสียคุณภาพ */
          const mb = page.getMediaBox();
          page.setCropBox(mb.x + it.crop.x * mb.width,
                          mb.y + (1 - it.crop.y - it.crop.h) * mb.height,
                          it.crop.w * mb.width, it.crop.h * mb.height);
          if (it.rotate) {
            const base = page.getRotation().angle;
            page.setRotation(degrees((base + it.rotate) % 360));
          }
          out.addPage(page);
          continue;
        }
        if (it.crop) {
          const src = srcDocs.get(it.fi).getPage(it.index);
          const mb = src.getMediaBox();
          const left = mb.x + it.crop.x * mb.width;
          const right = left + it.crop.w * mb.width;
          const top = mb.y + (1 - it.crop.y) * mb.height;
          const bottom = top - it.crop.h * mb.height;
          const emb = await out.embedPage(src, { left, bottom, right, top });
          const np = out.addPage([it.pw, it.ph]);
          const k = Math.min(it.pw / emb.width, it.ph / emb.height);
          const w = emb.width * k, h = emb.height * k;
          np.drawPage(emb, { x: (it.pw - w) / 2, y: (it.ph - h) / 2, width: w, height: h });
          if (it.rotate) np.setRotation(degrees(it.rotate % 360));
          continue;
        }
        if (it.rotate) {
          const base = page.getRotation().angle;
          page.setRotation(degrees((base + it.rotate) % 360));
        }
        out.addPage(page);
      }

      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.ok(tr(`บันทึกแล้ว ${keep.length} หน้า`, `Saved, ${pl(keep.length, "page", "pages")}`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (hiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      // หลายไฟล์ใช้ชื่อกลาง ๆ เพราะเอาชื่อไฟล์แรกมาตั้งจะเข้าใจผิดว่าได้แค่ไฟล์นั้น
      const name = files.length > 1
        ? tr("รวมจัดหน้าใหม่.pdf", "combined-pages.pdf")
        : stripExt(files[0].name) + tr("-จัดหน้าใหม่.pdf", "-edited.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${keep.length} หน้า`, `${pl(keep.length, "page", "pages")}`))]),
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

  setCropMode("same");

  return ws.wrap;
}
