// ── ของสำเร็จรูปแจกฟรี ────────────────────────────────────────────────────
//
// ที่มา: ผ่าเว็บ thepexcel.com 12/09/2026 (.claude/research/2026-09-12-thepexcel-full-system.md)
// เขาให้ "แจก🎁" ยืนเป็นเมนูหลักเทียบเท่าบทความและคอร์ส ทั้งที่เป็นของฟรี
// เพราะของแจกคือสิ่งที่ทำให้คนกลับมาและบอกต่อ และเป็นของที่พิสูจน์ฝีมือก่อนขาย
//
// ‼️ ของในหน้านี้ต้องเป็นของที่ "มีอยู่จริงและใช้งานได้จริง" เท่านั้น
//    ทั้งสามชิ้นเป็นไฟล์ที่เครื่องมือในเว็บนี้ใช้อยู่จริง ผ่านการทดสอบมาแล้ว
//    ไม่ใช่ของที่เพิ่งเขียนขึ้นมาเพื่อให้หน้านี้ดูมีของเยอะ
//
// ‼️ ขนาดไฟล์และจำนวนบรรทัด อ่านจากไฟล์จริงตอนเปิดหน้า ไม่ได้เขียนตายตัวไว้
//    ไฟล์ถูกแก้เมื่อไหร่ ตัวเลขก็เปลี่ยนตามเอง ไม่มีทางค้างเป็นตัวเลขเก่าที่โกหก
//    (บทเรียนจากแถบ "ลองแล้วได้แบบนี้" ที่ต้องมีเทสคอยยืนยันว่าตัวเลขยังตรงความจริง)
//
// ‼️ ไม่ต้องแก้ service worker ให้แคชไฟล์พวกนี้ เพราะ same-origin ถูกแคชแบบ
//    stale-while-revalidate อยู่แล้ว เปิดครั้งแรกแล้วใช้ออฟไลน์ได้เลย

import { workspace } from "../workspace.js";
import { el, statusBar, button, download } from "../ui.js";
import { uiIcon } from "../icons.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { tr, pl } from "../i18n.js";

/* ‼️ path ต้องเป็นแบบสัมพัทธ์ ไม่ขึ้นต้นด้วย / เพราะเว็บอยู่ใต้ /filekit/ บน GitHub Pages */
const GIFTS = () => [
  {
    file: "samples/powerquery/fnMultiSourceFallbackLookup.pq",
    lang: "m",
    group: tr("Power Query", "Power Query"),
    title: tr("ฟังก์ชันค้นข้ามหลายแหล่ง", "Multi source fallback lookup"),
    what: tr("ไล่หาค่าจากหลายตารางตามลำดับ เจอแหล่งแรกที่มีแล้วหยุด ใช้แทนการซ้อน Merge หลายชั้น",
             "Looks a value up across several tables in order and stops at the first hit, instead of stacking merges"),
    how: tr("ใน Power Query กด New Source แล้วเลือก Blank Query เปิด Advanced Editor แล้ววางทับทั้งหมด",
            "In Power Query choose New Source then Blank Query, open Advanced Editor and paste over everything"),
    tool: "pq-multisource-lookup",
  },
  {
    file: "samples/powerbi/bar.vl.json",
    lang: "json",
    group: tr("Power BI", "Power BI"),
    title: tr("สเปก Deneb กราฟแท่งแนวนอน", "Deneb spec, horizontal bar chart"),
    what: tr("ความยาวแท่งตรงสัดส่วนค่าจริงเสมอ มีป้ายตัวเลข เส้นเป้าหมาย และรองรับค่าติดลบ",
             "Bar length always matches the real numbers, with value labels, a target line and negative values"),
    how: tr("ใส่วิชวล Deneb ในรายงาน ลากฟิลด์ลงช่อง Values แล้ววางสเปกนี้ในแท็บ Specification",
            "Add a Deneb visual, drop your fields into Values, then paste this into the Specification tab"),
    tool: "pbi-bar",
  },
  {
    file: "samples/powerbi/donut.vl.json",
    lang: "json",
    group: tr("Power BI", "Power BI"),
    title: tr("สเปก Deneb กราฟโดนัท", "Deneb spec, donut chart"),
    what: tr("วงโดนัทพร้อมตัวเลขกลางวง ป้ายกำกับ และการยุบส่วนย่อยเป็น อื่น ๆ",
             "A donut with a centre figure, labels and small slices folded into an other group"),
    how: tr("ใส่วิชวล Deneb ในรายงาน ลากฟิลด์ลงช่อง Values แล้ววางสเปกนี้ในแท็บ Specification",
            "Add a Deneb visual, drop your fields into Values, then paste this into the Specification tab"),
    tool: "pbi-donut",
  },
  {
    file: "samples/powerquery/fnThaiDateTable.pq",
    lang: "m",
    group: tr("Power Query", "Power Query"),
    title: tr("ตารางปฏิทินไทย พร้อมปีงบประมาณ", "Thai date table with fiscal year"),
    what: tr("ได้ครบทั้ง พ.ศ. ชื่อเดือนไทย ปีงบที่เริ่มเดือนไหนก็ได้ และคอลัมน์เรียงเดือนที่ทำให้กราฟไม่เรียงผิด",
             "Buddhist years, Thai month names, a fiscal year starting any month, and a sort column so charts never sort months alphabetically"),
    how: tr("วางเป็น Blank Query แล้วเรียกใช้ว่า fnThaiDateTable(#date(2023,1,1), #date(2026,12,31), 10) จากนั้นคลิกขวาที่ตารางใน Power BI แล้วเลือก Mark as date table",
            "Paste as a Blank Query, then call fnThaiDateTable(#date(2023,1,1), #date(2026,12,31), 10) and mark the result as a date table in Power BI"),
    tool: "pq-multisource-lookup",
    proof: tr("ยิงผ่าน Power Query engine ของ Excel จริงแล้ว ตรงทุกค่าใน 14 คอลัมน์ x 6 วันที่ที่เป็นจุดเปลี่ยน",
              "Run through Excel's real Power Query engine, every value matches across 14 columns and 6 boundary dates"),
  },
  /* ‼️ ไฟล์ธีมสามชุดนี้สร้างด้วยโค้ดตัวเดียวกับเครื่องมือสร้างธีม ไม่ได้เขียนมือ
     แก้ชุดสีในเครื่องมือเมื่อไหร่ ต้องสร้างไฟล์ใหม่ด้วย (tests/freebies.test.mjs บังคับไว้)
     ‼️ เขียนแยกทีละใบ ไม่ใช้ลูป เพราะเทสอ่านรายชื่อไฟล์จากซอร์สด้วย regex
        ถ้าใช้ template literal เทสจะมองไม่เห็นแล้วนับของแจกขาด
     ‼️ มีแต่ชุดของกลาง ไม่มีธีมขององค์กรใดในนี้ */
  {
    file: "samples/powerbi/theme-terra.json",
    lang: "json",
    group: tr("Power BI", "Power BI"),
    title: tr("ธีม Power BI ดินเผา", "Power BI theme, Terracotta"),
    what: tr("ชุดสี 5 สีที่วัดแล้วว่าคนตาบอดสีแยกออกครบทุกสี และทุกสีอ่านออกบนพื้นหลังของมันเอง",
             "Five colours measured to stay apart for colour blind viewers, each readable on its own background"),
    how: tr("ใน Power BI Desktop ไปที่แท็บ View แล้ว Themes แล้ว Browse for themes แล้วเลือกไฟล์นี้",
            "In Power BI Desktop open the View tab, Themes, Browse for themes and pick this file"),
    tool: "pbi-theme",
    proof: tr("ระยะห่างสีต่ำสุด 18.33 และผ่าน schema 2.157 ของ Microsoft",
              "Minimum colour distance 18.33, valid against Microsoft schema 2.157"),
  },
  {
    file: "samples/powerbi/theme-jewel.json",
    lang: "json",
    group: tr("Power BI", "Power BI"),
    title: tr("ธีม Power BI อัญมณี", "Power BI theme, Jewel"),
    what: tr("ชุดสี 5 สีที่วัดแล้วว่าคนตาบอดสีแยกออกครบทุกสี และทุกสีอ่านออกบนพื้นหลังของมันเอง",
             "Five colours measured to stay apart for colour blind viewers, each readable on its own background"),
    how: tr("ใน Power BI Desktop ไปที่แท็บ View แล้ว Themes แล้ว Browse for themes แล้วเลือกไฟล์นี้",
            "In Power BI Desktop open the View tab, Themes, Browse for themes and pick this file"),
    tool: "pbi-theme",
    proof: tr("ระยะห่างสีต่ำสุด 15.74 และผ่าน schema 2.157 ของ Microsoft",
              "Minimum colour distance 15.74, valid against Microsoft schema 2.157"),
  },
  {
    file: "samples/powerbi/theme-night.json",
    lang: "json",
    group: tr("Power BI", "Power BI"),
    title: tr("ธีม Power BI จอมืด", "Power BI theme, Dark canvas"),
    what: tr("ชุดสี 5 สีที่วัดแล้วว่าคนตาบอดสีแยกออกครบทุกสี และทุกสีอ่านออกบนพื้นหลังของมันเอง",
             "Five colours measured to stay apart for colour blind viewers, each readable on its own background"),
    how: tr("ใน Power BI Desktop ไปที่แท็บ View แล้ว Themes แล้ว Browse for themes แล้วเลือกไฟล์นี้",
            "In Power BI Desktop open the View tab, Themes, Browse for themes and pick this file"),
    tool: "pbi-theme",
    proof: tr("ระยะห่างสีต่ำสุด 15.79 และผ่าน schema 2.157 ของ Microsoft",
              "Minimum colour distance 15.79, valid against Microsoft schema 2.157"),
  },
];

const STYLE = `
.gf-list{display:flex; flex-direction:column; gap:14px}
.gf-card{border:1px solid var(--line); border-radius:var(--r); background:var(--bg-soft); overflow:hidden}
.gf-head{padding:14px 16px}
.gf-top{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px}
.gf-tag{font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
  color:var(--g-powerbi); border:1px solid color-mix(in srgb,var(--g-powerbi) 42%,transparent);
  border-radius:999px; padding:3px 9px; line-height:1.5}
.gf-size{margin-inline-start:auto; font-size:11.5px; font-weight:700; color:var(--text-mute);
  font-variant-numeric:tabular-nums; line-height:1.5}
.gf-title{margin:0 0 6px; font-size:15px; font-weight:800; line-height:1.5; color:var(--text)}
/* ‼️ ตัวอักษรสำหรับ "อ่าน" ใหญ่และโปร่งกว่าตัวอักษรของหน้าจอ (วัดจาก thepexcel 19.2px/1.7) */
.gf-what{margin:0 0 8px; font-size:14.5px; line-height:1.75; color:var(--text-dim)}
.gf-proof{margin:6px 0 0; display:flex; gap:6px; align-items:flex-start;
  font-size:12px; line-height:1.7; color:var(--g-data)}
/* ‼️ เคยใช้อักขระ U+2713 ซึ่งฟอนต์ไทยบางตัวไม่มี แล้วขึ้นเป็นกล่องสี่เหลี่ยม
   (tests/browser_noemoji.py จับได้ 12/09/2026) เปลี่ยนเป็นไอคอนเส้นที่วาดเอง */
.gf-tick{flex:none; width:13px; height:13px; margin-top:3px; stroke:currentColor;
  stroke-width:2.6; fill:none; stroke-linecap:round; stroke-linejoin:round}
.gf-how{margin:0; font-size:13px; line-height:1.7; color:var(--text-mute);
  padding-inline-start:11px; border-inline-start:2px solid var(--line)}
.gf-act{display:flex; gap:8px; flex-wrap:wrap; padding:0 16px 14px}
.gf-see{border-top:1px solid var(--line-soft)}
.gf-see summary{cursor:pointer; list-style:none; padding:11px 16px; min-height:44px;
  display:flex; align-items:center; gap:9px; font-size:13px; font-weight:700; color:var(--text-dim)}
.gf-see summary::-webkit-details-marker{display:none}
.gf-see summary::before{content:"\\002B"; width:16px; text-align:center; color:var(--text-mute)}
.gf-see[open] summary::before{content:"\\2212"}
.gf-see summary:hover{color:var(--text); background:var(--card-hi)}
.gf-see summary:focus-visible{outline:2px solid var(--focus); outline-offset:-2px}
.gf-pre{margin:0; max-height:360px; overflow:auto; padding:12px 16px 16px;
  font:12.5px/1.7 ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  color:var(--text); white-space:pre; tab-size:2; border-top:1px solid var(--line-soft)}
.gf-note{font-size:13px; line-height:1.75; color:var(--text-dim); margin:0 0 14px}
` + CODE_TOKEN_CSS;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });
  const st = statusBar();
  const list = el("div", { class: "gf-list" });

  const ws = workspace(tool, {
    center: {
      title: tr("ของที่แจก", "What you can take"),
      node: el("div", {}, [
        el("p", { class: "gf-note" },
          tr("ทุกชิ้นเป็นไฟล์ที่เครื่องมือในเว็บนี้ใช้อยู่จริง เอาไปใช้ต่อได้เลยไม่ต้องขออนุญาต",
             "Every file here is one this site actually uses. Take it and use it, no permission needed")),
        list,
      ]),
    },
    footer: [st.node],
    note: tr(
      "อยากปรับให้ตรงงานของคุณเองมากกว่านี้ เปิดเครื่องมือที่ลิงก์ไว้ในแต่ละชิ้น แล้วปรับค่าแล้วคัดลอกโค้ดใหม่ได้",
      "Want it tuned to your own data? Open the tool linked on each item, adjust the settings and copy fresh code"
    ),
  });
  ws.wrap.prepend(styleEl);
  ws.showCanvas(true);
  load();
  return ws.wrap;

  async function load() {
    st.info(tr("กำลังอ่านไฟล์…", "Reading the files…"));
    const gifts = GIFTS();
    let ok = 0;
    for (const g of gifts) list.appendChild(card(g));
    await Promise.all(gifts.map(async (g) => {
      try {
        const res = await fetch(g.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        g.text = await res.text();
        ok++;
        fill(g);
      } catch (e) {
        console.error(e);
        fail(g);
      }
    }));
    /* ‼️ บอกตามจริงว่าอ่านได้กี่ชิ้น ไม่ใช่ขึ้นว่าสำเร็จทั้งที่บางชิ้นพัง */
    if (ok === gifts.length) st.ok(tr(`พร้อมให้หยิบ ${ok} ชิ้น`, `${pl(ok, "file", "files")} ready`));
    else st.err(tr(`อ่านได้ ${ok} จาก ${gifts.length} ชิ้น ลองรีเฟรชหน้าอีกครั้ง`,
                   `Only ${ok} of ${gifts.length} could be read, try refreshing`));
  }

  function card(g) {
    g.sizeEl = el("span", { class: "gf-size" }, tr("กำลังอ่าน…", "reading…"));
    g.preEl = el("pre", { class: "gf-pre" });
    g.copyBtn = button(tr("คัดลอกโค้ด", "Copy code"), { icon: "copy", disabled: true, onclick: () => copy(g) });
    g.dlBtn = button(tr("ดาวน์โหลดไฟล์", "Download file"), { icon: "download", ghost: true, disabled: true, onclick: () => save(g) });
    g.node = el("div", { class: "gf-card" }, [
      el("div", { class: "gf-head" }, [
        el("div", { class: "gf-top" }, [el("span", { class: "gf-tag" }, g.group), g.sizeEl]),
        /* ‼️ ต้องเป็น h2 ไม่ใช่ h3 เพราะหน้านี้ไม่ได้ใช้โครง workspace() ที่มี h2 ของแผง
           หัวข้อถัดจาก h1 จึงกระโดดข้ามขั้น (tests/browser_a11y.py จับได้ 12/09/2026) */
        el("h2", { class: "gf-title" }, g.title),
        el("p", { class: "gf-what" }, g.what),
        el("p", { class: "gf-how" }, g.how),
        /* ‼️ บอกด้วยว่าของชิ้นนี้ถูกพิสูจน์มายังไง เพราะของแจกที่ไม่มีหลักฐาน
           ก็เป็นแค่ไฟล์ที่ใครก็เขียนได้ สิ่งที่ทำให้มันมีค่าคือการที่มันถูกทดสอบจริง */
        g.proof ? el("p", { class: "gf-proof" }, [
          uiIcon("check", "gf-tick"), g.proof,
        ]) : null,
      ]),
      el("div", { class: "gf-act" }, [
        g.copyBtn, g.dlBtn,
        el("a", { class: "btn ghost", href: "#/" + g.tool },
          tr("ปรับเองในเครื่องมือ", "Tune it in the tool")),
      ]),
      el("details", { class: "gf-see" }, [
        el("summary", {}, tr("ดูโค้ดก่อน", "See the code first")),
        g.preEl,
      ]),
    ]);
    return g.node;
  }

  function fill(g) {
    const lines = g.text.split("\n").length;
    const kb = (new Blob([g.text]).size / 1024).toFixed(1);
    g.sizeEl.textContent = tr(`${lines.toLocaleString("th-TH")} บรรทัด, ${kb} KB`,
                              `${pl(lines.toLocaleString("en-US"), "line", "lines")}, ${kb} KB`);
    /* ‼️ ทาสีตอนกางครั้งแรกเท่านั้น สเปก Deneb ยาว 1,300 บรรทัด
       ถ้าทาตั้งแต่เปิดหน้าจะหน่วงเปล่า ๆ ทั้งที่คนส่วนใหญ่ไม่กาง (บทเรียนจาก codeview.js) */
    const box = g.node.querySelector(".gf-see");
    box.addEventListener("toggle", () => {
      if (box.open && !g.painted) { g.painted = true; g.preEl.innerHTML = paintCode(g.text, g.lang); }
    }, { once: false });
    g.copyBtn.disabled = false;
    g.dlBtn.disabled = false;
  }

  function fail(g) {
    g.sizeEl.textContent = tr("อ่านไฟล์ไม่ได้", "could not read");
    g.preEl.textContent = tr("ไฟล์นี้อ่านไม่ได้ตอนนี้ ลองรีเฟรชหน้าอีกครั้ง",
                             "This file could not be read right now, try refreshing the page");
  }

  async function copy(g) {
    try {
      await navigator.clipboard.writeText(g.text);
      st.ok(tr("คัดลอกแล้ว เอาไปวางได้เลย", "Copied, paste it wherever you need"));
    } catch {
      st.err(tr("คัดลอกไม่สำเร็จ กดดูโค้ดแล้วลากคลุมเอง หรือกดดาวน์โหลดไฟล์แทน",
                "Could not copy, open the code and select it, or download the file"));
    }
  }

  function save(g) {
    const name = g.file.split("/").pop();
    download(new Blob([g.text], { type: "text/plain;charset=utf-8" }), name);
    st.ok(tr(`ดาวน์โหลด ${name} แล้ว`, `Downloaded ${name}`));
  }
}
