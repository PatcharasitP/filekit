import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, download } from "../ui.js";
import { tr } from "../i18n.js";
import { colorPicker, contrastBadge, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { jumpSystem, JUMPTO_CSS } from "../jumpto.js";
import { presetBar, PRESETS_CSS } from "../presets.js";
import { stateKit, SHARE_MSG } from "../statekit.js";

/* ‼️ ทำไมเครื่องนี้ถึงคุ้มค่าที่สุดในหมวด Power Automate
 * แอ็กชัน Create HTML table คืน HTML เปล่า ๆ ไม่มีสไตล์เลย และ Outlook เดสก์ท็อป
 * เรนเดอร์ด้วยเอนจินของ Word ซึ่ง "ตัด CSS ที่ประกาศรวม" ทิ้งหมด ตารางเลยไม่มีเส้น
 * ท่าที่ใช้ได้จริงคือซ้อน replace() ใส่สไตล์ inline รายช่อง ซึ่งเขียนมือแล้วพลาดง่ายมาก
 *
 * กับดักที่แพงที่สุด: Power Automate ไม่ตีความ backslash เป็น escape
 * ใครเผลอเขียน \" ในนิพจน์ มันจะหลุดเป็นตัวอักษรจริงใน HTML แล้วสไตล์พังเงียบ
 * ทั้งที่ flow ขึ้น Succeeded (บั๊กนี้ฝังในเทมเพลตอีเมลของพี่ปอนด์อยู่หลายเดือน
 * จนจับได้ตอนเปิดเมลจริง) เครื่องนี้จึงไม่มีทางสร้าง \" ออกมาได้ และมีด่านตรวจซ้ำอีกชั้น
 */

const SAMPLE_ROWS = 3;

/* ‼️ ห้ามใช้ \" ใน HTML ที่จะไปอยู่ในนิพจน์ของ flow เด็ดขาด Power Automate ไม่ตีความ
 * backslash เป็น escape มันจะหลุดเป็นตัวอักษรจริงแล้วสไตล์พังเงียบ ๆ ทั้งที่ run สำเร็จ
 * ทางออกคือใช้ ' ครอบสตริงของ WDL แล้วใน HTML ใช้ " ได้ตามปกติ ไม่ต้อง escape อะไรเลย
 * ‼️ ต้องอยู่ระดับบนสุด ไม่ใช่ใน mount() เพราะ mount เรียก setView() ตั้งแต่ต้น
 * แล้วจะได้ ReferenceError จาก temporal dead zone (เจอจริง 11/09/2026 รอบที่สอง) */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// WDL ใช้ '' แทนเครื่องหมายคำพูดเดี่ยวตัวเดียว ไม่ใช่ \'
const wdl = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const at = (expr) => `@{${String(expr || "").trim()}}`;

const STYLE = `
.pah-code{margin:0;padding:14px 16px;border-radius:var(--r-sm);background:var(--bg-soft);
  border:1px solid var(--line);overflow:auto;max-height:min(58vh,560px)}
.pah-code code{font-size:12.5px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word}
.pah-tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.pah-preview{border:1px solid var(--line);border-radius:var(--r-sm);background:#ffffff;
  padding:18px;overflow:auto;max-height:min(58vh,560px)}
/* ‼️ บนมือถือ 58vh = 490px จากจอ 844px คิดเป็น 58% กลายเป็น "กับดักสกอลล์ซ้อน"
   คือมีช่องเลื่อนเล็ก ๆ ซ้อนอยู่ในหน้าที่เลื่อนได้อยู่แล้ว นิ้วปัดแล้วไม่รู้ว่าเลื่อนอันไหน
   (จับได้จาก tests/browser_mobile.py ข้อ ③ เกณฑ์ต้อง >= 70% ของความสูงจอ)
   จอเล็กจึงยืดให้สูงพอจนไม่ใช่กับดัก ส่วนจอใหญ่คงเดิมเพราะมีที่ให้เห็นบริบทรอบ ๆ อยู่แล้ว */
@media (max-width:640px){ .pah-preview{max-height:78vh} }
.pah-preview *{max-width:100%}
.pah-col{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);padding:9px 11px;margin-bottom:8px}
.pah-col-head{display:flex;align-items:center;gap:6px;margin-bottom:7px}
.pah-col-head input{flex:1}
.pah-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:6px;
  width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px}
.pah-mini:hover:not(:disabled){border-color:var(--g-powerbi,var(--brand))}
.pah-mini:disabled{opacity:.35;cursor:default}
/* ‼️ นิ้วแตะต้องการ 36x36px (WCAG 2.5.8 / Apple HIG / Material) แต่ปุ่มไอคอนพวกนี้กว้าง 26px
   วัดบนจอ 390x844 จริงแล้วตกเกณฑ์ทุกใบ (tests/browser_mobile.py ข้อ ④)
   ขยายเฉพาะอุปกรณ์สัมผัส เมาส์บนจอใหญ่คงขนาดกระชับเหมือนเดิม */
@media (pointer:coarse){ .pah-mini{width:36px;height:36px} }
.pah-mini.danger:hover:not(:disabled){border-color:#d64550;color:#d64550}
.pah-hint{font-size:12px;color:var(--text-mute);line-height:1.7;margin:6px 0 0}
.pah-warn{border:1px solid var(--line);border-left:3px solid var(--g-powerbi,var(--brand));
  border-radius:var(--r-sm);background:var(--bg-soft);padding:10px 12px;font-size:12.5px;
  color:var(--text);line-height:1.7;margin-bottom:12px}
.pah-row2{display:flex;gap:10px;flex-wrap:wrap}
.pah-row2 > *{flex:1;min-width:120px}
${COLORKIT_CSS}
${JUMPTO_CSS}
${PRESETS_CSS}

/* ‼️ คลาสสองชุดนี้ยืมชื่อมาจากเครื่องมือกราฟโดนัท แต่ CSS ของมันฝังอยู่ในโมดูลนั้น
   หน้านี้ไม่ได้โหลดโมดูลนั้น จึงต้องประกาศเองซ้ำ ไม่งั้นสวิตช์กลายเป็นช่องติ๊กเปล่า
   (เจอจริงตอนดูจอ 11/09/2026) กฎของโปรเจกต์คือสไตล์อยู่ในโมดูลตัวเอง ห้ามไปแก้ tool.css */
.pbid-group-title{margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--text-mute)}
.pbid-switch-field{display:flex;align-items:center;justify-content:space-between;flex-direction:row;gap:10px}
.pbid-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}
.pbid-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%;z-index:1}
.pbid-switch-track{position:absolute;inset:0;background:var(--line);border-radius:999px;
  transition:background .15s var(--ease-snap,ease)}
.pbid-switch-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);
  transition:transform .15s var(--ease-snap,ease)}
.pbid-switch input:checked + .pbid-switch-track{background:var(--g-powerbi,var(--brand))}
.pbid-switch input:checked + .pbid-switch-track::after{transform:translateX(18px)}
.pbid-switch input:focus-visible + .pbid-switch-track{outline:2px solid var(--brand);outline-offset:2px}
/* ‼️ สวิตช์สูง 24px เตี้ยกว่าเกณฑ์นิ้วแตะ 36px — ยืดกรอบที่กดได้เป็น 36 แต่คงรางสูง 24 เท่าเดิม
   โดยดันขอบบนล่างเข้ามา 6px (ทับ inset:0 ของราง) หน้าตาจึงไม่เปลี่ยน แค่กดโดนง่ายขึ้น */
@media (pointer:coarse){
  .pbid-switch{height:36px}
  .pbid-switch-track{top:6px;bottom:6px}
}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();

  // ‼️ ต้องประกาศไว้บนสุด ไม่ใช่ใต้ฟังก์ชันที่ใช้มัน
  // โค้ดสร้างแผงในไฟล์นี้ทำงานตั้งแต่ต้น mount ส่วน const ไม่ hoist เหมือน function
  // วางผิดที่เมื่อไรได้ ReferenceError ทันที (พลาดมาแล้ว 3 รอบในคืนเดียว 11/09/2026)
  const jump = jumpSystem();   // คลิกบนตัวอย่างแล้วพาไปหาช่องที่คุมมัน
  const pickers = {};   // key -> ตัวเลือกสี ไว้ setUI ตอนคืนค่าเริ่มต้น
  const badges = [];    // ป้ายเตือนความต่างสี ต้อง update ทุกครั้งที่สีเปลี่ยน

  const SEED = () => ({
    // ‼️ ค่าเริ่มต้นตั้งใจให้เป็นเรื่องที่คนทั่วไปอ่านแล้วเข้าใจทันที ไม่ใช่ข้อมูลงานของใครคนใดคนหนึ่ง
    // ใช้ท่า SharePoint Get items ซึ่งเป็นทางที่คนเจอบ่อยที่สุด คีย์เป็นชื่อคอลัมน์ตรง ๆ ไม่มีวงเล็บครอบ
    source: "body('GetItems')?['value']",
    columns: [
      { header: tr("เลขที่ออเดอร์", "Order no"), value: "item()?['OrderNo']" },
      { header: tr("ลูกค้า", "Customer"), value: "item()?['Customer']" },
      { header: tr("สินค้า", "Product"), value: "item()?['Product']" },
      { header: tr("กำหนดส่ง", "Due date"), value: "formatDateTime(item()?['DueDate'], 'dd/MM/yyyy')" },
      { header: tr("ยอดเงิน", "Amount"), value: "item()?['Amount']" },
    ],
    head: {
      title: tr("รายการรอจัดส่ง", "Orders waiting to ship"),
      subtitle: tr("ออเดอร์ที่ยังไม่ได้ส่งของ", "Orders that have not gone out yet"),
      showCard: true,
      cardValue: "length(body('GetItems')?['value'])",
      cardLabel: tr("ออเดอร์ทั้งหมด", "Total orders"),
      note: tr("อีเมลนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ", "This message was sent automatically, please do not reply"),
    },
    look: {
      headerBg: "#D9D9D9", headerColor: "#222222", borderColor: "#D9D9D9",
      fontSize: "12", width: "640",
    },
    // ‼️ ค่าเริ่มต้นเดิมคือ BuildEmailTable/ComposeEmailBody ซึ่งเป็นชื่อที่ flow ของพี่ปอนด์ใช้อยู่แล้ว
    // วางแล้วชนทันที หน้าออกแบบเลยเติม " 1" ต่อท้ายให้ (เจอจริง 11/09/2026 ตอนวางลง flow เก่า)
    // เปลี่ยนเป็นชื่อที่ไม่ค่อยไปชนของเดิม แต่ยังอ่านออกว่าคืออะไร
    names: { scope: "EmailBodyBlock", table: "EmailHtmlTable", compose: "EmailBodyHtml" },
  });

  /* ‼️ เขียนเฉพาะค่าที่ชุดนั้นเปลี่ยนจริง ไม่ต้องเขียนครบทุกช่อง
     ค่าที่ไม่ระบุจะกลับไปใช้ค่าเริ่มต้น ทำให้กดสลับชุดไปมาแล้วไม่มีค่าค้างจากชุดก่อน */
  const PRESETS = [
    { id: "formal", name: tr("ทางการ", "Formal"),
      desc: tr("หัวตารางเทา เส้นบาง อ่านง่ายในอีเมลงาน", "Grey header, thin lines, easy to read in a work email"),
      values: {} },
    { id: "compact", name: tr("กระชับ", "Compact"),
      desc: tr("ไม่มีการ์ดตัวเลข ตัวอักษรเล็กลง เหมาะกับรายการยาว", "No summary card, smaller text, good for long lists"),
      values: { head: { showCard: false }, look: { fontSize: "11", width: "560", borderColor: "#E0E0E0" } } },
    { id: "bold", name: tr("เน้นสี", "Bold"),
      desc: tr("หัวตารางสีเข้มตัวอักษรขาว เห็นหัวคอลัมน์ชัด", "Dark header with white text, the column names stand out"),
      values: { look: { headerBg: "#12239E", headerColor: "#FFFFFF", borderColor: "#BFBFBF", fontSize: "12.5" } } },
  ];

  const seed = SEED();
  let columns = seed.columns;
  const model = { source: seed.source };
  const head = seed.head;
  const look = seed.look;
  const names = seed.names;
  let view = "preview";

  const codeEl = el("code", {});
  const codeBox = el("pre", { class: "pah-code" }, [codeEl]);
  const previewBox = el("div", { class: "pah-preview" });
  const warnEl = el("div", { class: "pah-warn", hidden: true });

  const tabs = {
    preview: button(tr("พรีวิว", "Preview"), { onclick: () => setView("preview") }),
    html: button(tr("HTML สำหรับ Compose", "HTML for Compose"), { ghost: true, onclick: () => setView("html") }),
    json: button(tr("JSON วางลง flow", "JSON to paste into a flow"), { ghost: true, onclick: () => setView("json") }),
  };
  const jumpHint = el("p", { class: "pah-hint", style: "margin:0 0 10px" }, tr(
    "เคล็ดลับ คลิกตรงส่วนไหนก็ได้ในตัวอย่าง เว็บจะพาไปหาช่องที่คุมส่วนนั้นให้เอง",
    "Tip, click any part of the preview and the page takes you to the field that controls it"
  ));
  const centerNode = el("div", {}, [
    el("div", { class: "pah-tabs" }, Object.values(tabs)),
    jumpHint, warnEl, previewBox, codeBox,
  ]);

  const colsEl = el("div", {});
  const addColBtn = button(tr("เพิ่มคอลัมน์", "Add a column"), { icon: "plus", ghost: true, onclick: addColumn });
  const leftBody = el("div", {}, [
    field(tr("อาร์เรย์ต้นทาง", "Source array"), textInput(model, "source"),
      tr("นิพจน์ที่คืนอาร์เรย์ ไม่ต้องใส่ @ นำหน้า  คีย์จาก Power BI มีวงเล็บเหลี่ยมครอบ เช่น item()?['[ID]']",
         "An expression returning an array, no leading @. Power BI keys carry square brackets, like item()?['[ID]']")),
    el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("คอลัมน์ในตาราง", "Table columns")),
    el("p", { class: "pah-hint" }, tr(
      "ช่องบนคือหัวตาราง ช่องล่างคือนิพจน์ของค่าในแต่ละแถว ไม่ต้องใส่ @ นำหน้า",
      "The top box is the header, the bottom one is the value expression for each row, no leading @ needed"
    )),
    colsEl,
    el("div", { style: "margin-top:4px" }, [addColBtn]),
  ]);

  // เตือน 2 คู่ที่พังบ่อยที่สุดในอีเมลจริง หัวตารางอ่านไม่ออก กับเส้นขอบจางจนหายไปบนพื้นขาว
  const headBadge = contrastBadge(() => look.headerColor, () => look.headerBg,
    { what: tr("หัวตาราง", "Header") });
  const borderBadge = contrastBadge(() => look.borderColor, () => "#ffffff", {
    large: true, advisory: true, what: tr("เส้นขอบบนพื้นขาว", "Border on white"),
    advice: tr("เส้นจางมาก อ่านบนจอมือถือกลางแดดอาจไม่เห็นเส้นตาราง เข้มขึ้นอีกนิดจะชัดกว่า",
               "very faint, the grid may vanish on a phone screen in daylight, a slightly darker line reads better"),
  });
  badges.push(headBadge, borderBadge);

  /* ‼️ เทียบ diff ทีละก้อนบนสุด (head/look/names/columns) ไม่ได้เทียบรายช่อง
     เปลี่ยนช่องเดียวก็เก็บทั้งก้อนนั้น แลกความยาวลิงก์นิดหน่อยกับโค้ดที่ง่ายกว่ามาก
     วัดแล้วยังสั้นพอ เพราะแต่ละก้อนมีไม่กี่ค่า */
  const state = stateKit(tool.id, {
    defaults: SEED(),
    collect: () => ({ source: model.source, columns, head: { ...head }, look: { ...look }, names: { ...names } }),
    apply: (v) => {
      if (v.source) model.source = v.source;
      if (Array.isArray(v.columns)) columns = v.columns;
      if (v.head) Object.assign(head, v.head);
      if (v.look) Object.assign(look, v.look);
      if (v.names) Object.assign(names, v.names);
    },
  });

  const presets = presetBar(PRESETS, applyPreset);

  const rightBody = el("div", {}, [
    presets.node,
    el("h3", { class: "pbid-group-title" }, tr("หัวอีเมล", "Email header")),
    jfield("title", tr("หัวเรื่อง", "Title"), textInput(head, "title")),
    jfield("subtitle", tr("คำบรรยายใต้หัวเรื่อง", "Subtitle"), textInput(head, "subtitle")),
    switchField(tr("โชว์การ์ดตัวเลขสรุป", "Show the summary card"), head, "showCard"),
    jfield("cardValue", tr("นิพจน์ตัวเลขในการ์ด", "Card number expression"), textInput(head, "cardValue")),
    jfield("cardLabel", tr("คำอธิบายใต้ตัวเลข", "Caption under the number"), textInput(head, "cardLabel")),
    jfield("note", tr("หมายเหตุท้ายอีเมล", "Note at the bottom"), textInput(head, "note")),

    el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("หน้าตาตาราง", "Table look")),
    el("div", { class: "pah-row2" }, [
      field(tr("พื้นหัวตาราง", "Header background"), colorInput(look, "headerBg", SWATCHES.neutral)),
      field(tr("ตัวอักษรหัวตาราง", "Header text"), colorInput(look, "headerColor", SWATCHES.neutral)),
    ]),
    headBadge.node,
    el("div", { class: "pah-row2" }, [
      jfield("borderColor", tr("สีเส้นขอบ", "Border colour"), colorInput(look, "borderColor", SWATCHES.neutral)),
      field(tr("ขนาดตัวอักษร", "Font size"), numInput(look, "fontSize", 9, 20)),
    ]),
    borderBadge.node,
    field(tr("ความกว้างอีเมล (px)", "Email width (px)"), numInput(look, "width", 400, 900)),

    el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("ชื่อแอ็กชัน", "Action names")),
    el("p", { class: "pah-hint" }, tr(
      "ชื่อพวกนี้ต้องไม่ซ้ำกับแอ็กชันที่มีอยู่แล้วใน flow",
      "These must not clash with actions already in the flow"
    )),
    field(tr("ชื่อก้อน Scope", "Scope name"), textInput(names, "scope")),
    field(tr("ชื่อแอ็กชันสร้างตาราง", "Create table action"), textInput(names, "table")),
    field(tr("ชื่อแอ็กชันประกอบ HTML", "Compose action"), textInput(names, "compose")),
  ]);

  const copyBtn = button(tr("คัดลอก", "Copy"), { icon: "copy", onclick: onCopy });
  const dlBtn = button(tr("ดาวน์โหลด", "Download"), { icon: "download", ghost: true, onclick: onDownload });
  const shareBtn = button(tr("คัดลอกลิงก์ค่านี้", "Copy a link to these settings"), { icon: "copy", ghost: true, onclick: onShare });
  const resetBtn = button(tr("คืนค่าเริ่มต้น", "Reset to defaults"), { icon: "undo", ghost: true, onclick: onReset });

  const ws = workspace(tool, {
    left: { title: tr("ข้อมูลในตาราง", "Table data"), node: leftBody,
      hint: tr("ใช้ชื่อคีย์ตามที่ออกมาจากแอ็กชันก่อนหน้าจริง ๆ", "Use the key names exactly as the previous action returns them") },
    center: { title: tr("ผลลัพธ์", "Result"), node: centerNode },
    right: { title: tr("ปรับแต่ง", "Customize"), node: rightBody },
    footer: [copyBtn, dlBtn, shareBtn, resetBtn, st.node],
    note: tr(
      "คัดลอกแท็บ JSON กดขวาในหน้าออกแบบ flow เลือก Paste  ชื่อซ้ำจะถูกเติมเลข ต้องแก้ใน body(...) ตาม",
      "Copy the JSON tab and Paste it in the flow designer. Duplicate names get a number, so update body(...) to match"
    ),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);

  const restored = state.restore();
  if (restored) rebuildPanels();
  buildColumns();
  jump.attach(previewBox);
  setView("preview");
  if (restored) {
    st.ok(state.hasLink()
      ? tr("เปิดด้วยค่าที่มากับลิงก์", "Opened with the settings from the link")
      : tr("ใช้ค่าที่คุณตั้งไว้ครั้งก่อน", "Using the settings you had last time"));
    state.dropLinkParam();
  }

  return ws.wrap;

  /* ── ช่องกรอกแบบต่าง ๆ ────────────────────────────────────────────── */
  function textInput(obj, key) {
    const i = el("input", { type: "text" });
    i.value = obj[key] ?? "";
    i.addEventListener("input", () => { obj[key] = i.value; presets.clearActive(); render(); });
    return i;
  }
  // ‼️ ทุกช่องสีในเว็บนี้ใช้ตัวเดียวกันจาก colorkit.js เพื่อให้ได้ทั้งจานสีสำเร็จ
  // ช่องเลือกสี และช่องพิมพ์ hex ครบสามทาง และที่สำคัญกว่านั้นคือได้ป้ายเตือน
  // ตอนสีคู่ไหนอ่านไม่ออก ซึ่งเป็นปัญหาจริงของอีเมลที่ส่งให้คนอื่นอ่าน
  function colorInput(obj, key, swatches) {
    const p = colorPicker(obj[key], (hex) => {
      obj[key] = hex;
      badges.forEach((b) => b.update());
      presets.clearActive();
      render();
    }, { swatches: swatches || SWATCHES.neutral });
    pickers[key] = p;
    return p.node;
  }
  function numInput(obj, key, min, max) {
    const i = el("input", { type: "number", min: String(min), max: String(max) });
    i.value = obj[key];
    i.addEventListener("input", () => { obj[key] = i.value; presets.clearActive(); render(); });
    return i;
  }
  // สร้างช่องกรอกพร้อมลงทะเบียนปลายทางของการกระโดดในคราวเดียว
  function jfield(key, labelText, control, hint) {
    const node = field(labelText, control, hint);
    jump.register(key, node);
    return node;
  }

  function switchField(labelText, obj, key) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!obj[key];
    input.addEventListener("change", () => { obj[key] = input.checked; presets.clearActive(); render(); });
    return el("div", { class: "field pbid-switch-field" }, [
      el("span", {}, labelText),
      el("label", { class: "pbid-switch" }, [input, el("span", { class: "pbid-switch-track" })]),
    ]);
  }

  /* ── รายการคอลัมน์ ────────────────────────────────────────────────── */
  function buildColumns() {
    colsEl.innerHTML = "";
    jump.clearPrefix("col:");
    columns.forEach((c, i) => {
      const up = mini("↑", tr("เลื่อนขึ้น", "Move up"), () => moveCol(i, -1));
      const down = mini("↓", tr("เลื่อนลง", "Move down"), () => moveCol(i, 1));
      const del = mini("×", tr("ลบคอลัมน์นี้", "Remove this column"), () => { columns.splice(i, 1); buildColumns(); render(); }, true);
      up.disabled = i === 0;
      down.disabled = i === columns.length - 1;
      del.disabled = columns.length <= 1;

      const h = el("input", { type: "text", placeholder: tr("หัวตาราง", "Header") });
      h.value = c.header;
      h.addEventListener("input", () => { c.header = h.value; presets.clearActive(); render(); });

      const v = el("input", { type: "text", placeholder: tr("item()?['ชื่อคีย์']", "item()?['keyName']") });
      v.value = c.value;
      v.addEventListener("input", () => { c.value = v.value; presets.clearActive(); render(); });

      const card = el("div", { class: "pah-col" }, [
        el("div", { class: "pah-col-head" }, [h, up, down, del]),
        v,
      ]);
      jump.register("col:" + i, card);
      colsEl.appendChild(card);
    });
  }
  function mini(text, label, onclick, danger) {
    return el("button", { class: "pah-mini" + (danger ? " danger" : ""), type: "button", title: label, "aria-label": label, onclick }, text);
  }
  function moveCol(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    [columns[i], columns[j]] = [columns[j], columns[i]];
    buildColumns(); render();
  }
  function addColumn() {
    columns.push({ header: "", value: "" });
    buildColumns(); render();
  }

  /* ── ตัวช่วยประกอบข้อความ ─────────────────────────────────────────── */
  function tableStyles() {
    const b = look.borderColor;
    return {
      table: `cellpadding="0" cellspacing="0" width="100%" border="1" bordercolor="${b}" style="border-collapse:collapse;border:1px solid ${b};font-size:${look.fontSize}px;margin:0 0 14px 0;"`,
      th: `style="background:${look.headerBg};color:${look.headerColor};padding:6px 8px;border:1px solid ${b};text-align:left;"`,
      td: `style="border:1px solid ${b};padding:5px 8px;"`,
    };
  }

  // ซ้อน replace 3 ชั้นใส่สไตล์ inline ให้ทุกช่อง เพราะเอนจิน Word ของ Outlook ตัด CSS รวมทิ้ง
  function replaceChain() {
    const s = tableStyles();
    const inner = `body(${wdl(names.table)})`;
    return `replace(replace(replace(${inner}, ${wdl("<table>")}, ${wdl(`<table ${s.table}>`)}), ${wdl("<th>")}, ${wdl(`<th ${s.th}>`)}), ${wdl("<td>")}, ${wdl(`<td ${s.td}>`)})`;
  }

  // ‼️ ป้ายกระโดดติดเฉพาะตอนวาดพรีวิว ห้ามหลุดไปอยู่ใน HTML ที่ผู้ใช้ก็อปไปใช้จริง
  function buildHtml(forPreview = false) {
    const J = (key) => (forPreview ? ` data-jump="${key}"` : "");
    const w = look.width;
    const L = [];
    L.push(`<table cellpadding="0" cellspacing="0" width="${w}" align="left" style="background-color:#ffffff;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:14px;color:#222222;line-height:1.6;">`);
    L.push(`<tr><td>`);
    L.push(``);
    if (head.title.trim()) L.push(`  <div${J("title")} style="font-size:20px;font-weight:bold;color:#222222;">${esc(head.title)}</div>`);
    if (head.subtitle.trim()) L.push(`  <div${J("subtitle")} style="font-size:14px;color:#444444;margin-top:6px;">${esc(head.subtitle)}</div>`);
    if (head.showCard) {
      L.push(``);
      L.push(`  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E0E0E0;margin:20px 0 26px 0;">`);
      L.push(`    <tr><td style="background-color:#FAFAFA;padding:18px;">`);
      L.push(`      <div${J("cardValue")} style="font-size:40px;font-weight:bold;color:#222222;line-height:1.1;">${at(head.cardValue)}</div>`);
      L.push(`      <div${J("cardLabel")} style="font-size:13px;color:#666666;margin-top:4px;">${esc(head.cardLabel)}</div>`);
      L.push(`    </td></tr>`);
      L.push(`  </table>`);
    }
    L.push(``);
    L.push(`  <div style="border-top:1px solid #E0E0E0;padding-top:16px;">`);
    L.push(`    ${at(replaceChain())}`);
    L.push(`  </div>`);
    if (head.note.trim()) {
      L.push(``);
      L.push(`  <p${J("note")} style="margin:14px 0 0 0;font-size:12px;color:#888888;">${esc(head.note)}</p>`);
    }
    L.push(``);
    L.push(`</td></tr>`);
    L.push(`</table>`);
    return L.join("\n");
  }

  function buildJson() {
    const tableAction = {
      type: "Table",
      description: tr("สร้างตาราง HTML จากอาร์เรย์ต้นทาง", "Builds the HTML table from the source array"),
      inputs: {
        from: `@${model.source.trim()}`,
        format: "HTML",
        columns: columns
          .filter((c) => c.header.trim() || c.value.trim())
          .map((c) => ({ header: c.header, value: `@${c.value.trim()}` })),
      },
      runAfter: {},
    };
    const composeAction = {
      type: "Compose",
      description: tr("ประกอบ HTML ของอีเมลทั้งฉบับ", "Assembles the whole email HTML"),
      inputs: buildHtml(),
      runAfter: { [names.table]: ["Succeeded"] },
    };
    return {
      nodeId: names.scope,
      serializedValue: {
        type: "Scope",
        description: tr("สร้างเนื้ออีเมลพร้อมตาราง", "Builds the email body with its table"),
        actions: { [names.table]: tableAction, [names.compose]: composeAction },
        runAfter: {},
      },
      // ‼️ ว่างได้จริงเพราะทั้งสองแอ็กชันเป็นของในตัว Power Automate เอง ไม่ต้องต่อ connector ใด ๆ
      // ก้อนนี้จึงวางข้ามบัญชี ข้าม tenant ได้ ไม่ผูกกับ connection ของใครทั้งสิ้น
      allConnectionData: {},
      staticResults: {},
      isScopeNode: true,
      mslaNode: true,
    };
  }

  /* ── พรีวิว: แทนนิพจน์ด้วยค่าตัวอย่างแล้วเรนเดอร์จริง ─────────────── */
  function previewHtml() {
    const s = tableStyles();
    const cols = columns.filter((c) => c.header.trim() || c.value.trim());
    const rows = [];
    for (let r = 1; r <= SAMPLE_ROWS; r++) {
      rows.push("<tr>" + cols.map((c) => `<td data-jump="borderColor" ${s.td}>${esc(sampleValue(c, r))}</td>`).join("") + "</tr>");
    }
    const table = `<table ${s.table}><thead><tr>`
      + cols.map((c) => `<th data-jump="col:${columns.indexOf(c)}" ${s.th}>${esc(c.header)}</th>`).join("")
      + `</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    return buildHtml(true)
      .replace(at(replaceChain()), table)
      .replace(at(head.cardValue), String(SAMPLE_ROWS));
  }
  function sampleValue(c, r) {
    const h = (c.header || "").trim();
    if (/date|วันที่/i.test(h)) return `0${r}/09/2026`;
    if (/day|จำนวน|count|total|left|qty/i.test(h)) return String(r * 7);
    return `${h || tr("ค่า", "value")} ${r}`;
  }

  /* ‼️ ด่านตรวจของจริง ไม่ใช่แค่ความสวยงาม
   * ① backslash escape หลุดเข้ามา = สไตล์พังเงียบใน Outlook ทั้งที่ flow สำเร็จ
   * ② ทุกช่องต้องมีเส้นขอบ inline ไม่งั้นเอนจิน Word ตัดทิ้งจนตารางไม่มีเส้น
   * ③ ชื่อแอ็กชันซ้ำกัน = วางลง flow ไม่ได้ */
  function warnings() {
    const msgs = [];
    const html = buildHtml();
    if (html.includes('\\"') || html.includes("\\'")) {
      msgs.push(tr(
        "backslash หน้าเครื่องหมายคำพูดไม่ใช่ escape ใน Power Automate จะหลุดเป็นตัวอักษรจริง สไตล์พังเงียบ",
        "Found a backslash before a quote. Power Automate does not treat it as an escape, it leaks through as a real character and the styling breaks silently"
      ));
    }
    const s = tableStyles();
    if (!s.th.includes("border:1px solid") || !s.td.includes("border:1px solid")) {
      msgs.push(tr("เส้นขอบรายช่องหายไป Outlook เดสก์ท็อปจะไม่มีเส้นตาราง", "The per cell border is missing, Outlook desktop will show no table lines"));
    }
    const n = [names.scope, names.table, names.compose].map((x) => x.trim());
    if (new Set(n).size !== 3 || n.some((x) => !x)) {
      msgs.push(tr("ชื่อแอ็กชันทั้งสามต้องไม่ว่างและต้องไม่ซ้ำกัน", "The three action names must all be filled in and different from one another"));
    }
    if (!model.source.trim()) msgs.push(tr("ยังไม่ได้ใส่นิพจน์อาร์เรย์ต้นทาง", "No source array expression yet"));
    const blank = columns.filter((c) => c.header.trim() && !c.value.trim()).map((c) => c.header.trim());
    if (blank.length) msgs.push(tr(`ยังไม่ได้ใส่นิพจน์ของคอลัมน์: ${blank.join(", ")}`, `No value expression yet for: ${blank.join(", ")}`));
    return msgs;
  }

  function render() {
    state.save();
    const msgs = warnings();
    warnEl.hidden = msgs.length === 0;
    warnEl.textContent = msgs.join("  ");
    if (view === "preview") {
      previewBox.innerHTML = previewHtml();
    } else if (view === "html") {
      codeEl.textContent = buildHtml();
    } else {
      codeEl.textContent = JSON.stringify(buildJson(), null, 2);
    }
  }

  function setView(v) {
    view = v;
    for (const [k, b] of Object.entries(tabs)) b.classList.toggle("ghost", k !== v);
    previewBox.hidden = v !== "preview";
    codeBox.hidden = v === "preview";
    jumpHint.hidden = v !== "preview";
    render();
  }

  /* ── ปุ่มล่าง ─────────────────────────────────────────────────────── */
  async function onCopy() {
    if (view === "preview") { setView("html"); }
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      st.ok(view === "json"
        ? tr("คัดลอกแล้ว กดขวาบนพื้นที่ว่างในหน้าออกแบบ flow แล้วเลือก Paste", "Copied, right click an empty spot in the flow designer and choose Paste")
        : tr("คัดลอกแล้ว วางในแอ็กชัน Compose ได้เลย", "Copied, paste it into a Compose action"));
    } catch {
      st.err(tr("คัดลอกไม่ได้ ลองดาวน์โหลดไฟล์แทน", "Couldn't copy, try downloading instead"));
    }
  }

  function onDownload() {
    if (view === "preview") setView("html");
    const json = view === "json";
    const name = json ? "flow-email-block.json" : "email-body.html";
    download(new Blob([codeEl.textContent], { type: (json ? "application/json" : "text/html") + ";charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }

  /* ใส่ค่าจากชุดพร้อมใช้ เริ่มจากค่าเริ่มต้นเสมอแล้วทับด้วยค่าของชุดนั้น
     ถ้าไม่เริ่มใหม่ ค่าที่ชุดก่อนหน้าตั้งไว้จะค้างมาปนแบบที่ผู้ใช้ไม่ได้สั่ง */
  function applyPreset(values) {
    const base = SEED();
    columns = base.columns;
    model.source = base.source;
    Object.assign(head, base.head, values.head || {});
    Object.assign(look, base.look, values.look || {});
    Object.assign(names, base.names, values.names || {});
    rebuildPanels();
    badges.forEach((b) => b.update());
    st.ok(tr("ใช้ชุดที่เลือกแล้ว ปรับต่อได้ตามใจ", "Applied, tweak it from here"));
  }

  async function onShare() {
    const link = state.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }

  function onReset() {
    const fresh = SEED();
    columns = fresh.columns;
    model.source = fresh.source;
    Object.assign(head, fresh.head);
    Object.assign(look, fresh.look);
    Object.assign(names, fresh.names);
    rebuildPanels();
    badges.forEach((b) => b.update());
    state.forget();
    st.ok(tr("คืนค่าเริ่มต้นแล้ว", "Reset to defaults"));
  }

  // ช่องกรอกผูกค่าตอนสร้าง จึงต้องสร้างแผงขวาใหม่ทั้งก้อนตอนคืนค่า ไม่งั้นจอไม่ตรงกับข้างใน
  function rebuildPanels() {
    buildColumns();
    const fresh = el("div", {}, rightBody.childNodes.length ? [] : []);
    void fresh;
    rightBody.replaceChildren(...rebuildRight());
    setView(view);
  }
  function rebuildRight() {
    return [
      // ‼️ ต้องคืนแถบชุดพร้อมใช้มาด้วย ไม่งั้นกดชุดแรกแล้วแถบหายไปทั้งแถบ
      // เพราะการสร้างแผงใหม่ล้างลูกทั้งหมดของแผงขวาทิ้ง (เจอจริง 11/09/2026 ตอนเขียนเทส)
      presets.node,
      el("h3", { class: "pbid-group-title" }, tr("หัวอีเมล", "Email header")),
      jfield("title", tr("หัวเรื่อง", "Title"), textInput(head, "title")),
      jfield("subtitle", tr("คำบรรยายใต้หัวเรื่อง", "Subtitle"), textInput(head, "subtitle")),
      switchField(tr("โชว์การ์ดตัวเลขสรุป", "Show the summary card"), head, "showCard"),
      jfield("cardValue", tr("นิพจน์ตัวเลขในการ์ด", "Card number expression"), textInput(head, "cardValue")),
      jfield("cardLabel", tr("คำอธิบายใต้ตัวเลข", "Caption under the number"), textInput(head, "cardLabel")),
      jfield("note", tr("หมายเหตุท้ายอีเมล", "Note at the bottom"), textInput(head, "note")),
      el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("หน้าตาตาราง", "Table look")),
      el("div", { class: "pah-row2" }, [
        field(tr("พื้นหัวตาราง", "Header background"), colorInput(look, "headerBg")),
        field(tr("ตัวอักษรหัวตาราง", "Header text"), colorInput(look, "headerColor")),
      ]),
      el("div", { class: "pah-row2" }, [
        jfield("borderColor", tr("สีเส้นขอบ", "Border colour"), colorInput(look, "borderColor", SWATCHES.neutral)),
        field(tr("ขนาดตัวอักษร", "Font size"), numInput(look, "fontSize", 9, 20)),
      ]),
      field(tr("ความกว้างอีเมล (px)", "Email width (px)"), numInput(look, "width", 400, 900)),
      el("h3", { class: "pbid-group-title", style: "margin:18px 0 8px" }, tr("ชื่อแอ็กชัน", "Action names")),
      el("p", { class: "pah-hint" }, tr(
        "ชื่อพวกนี้ต้องไม่ซ้ำกับแอ็กชันที่มีอยู่แล้วใน flow",
        "These must not clash with actions already in the flow"
      )),
      field(tr("ชื่อก้อน Scope", "Scope name"), textInput(names, "scope")),
      field(tr("ชื่อแอ็กชันสร้างตาราง", "Create table action"), textInput(names, "table")),
      field(tr("ชื่อแอ็กชันประกอบ HTML", "Compose action"), textInput(names, "compose")),
    ];
  }
}
