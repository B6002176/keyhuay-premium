
 // ==UserScript==
 // @name         KeyHuay888 สรุปยอดถูก V7.3
 // @namespace    keyhuay888-summary
 // @version      7.3
 // @description  เลือกหวยอัตโนมัติ ปรับเรท 3 ตัวบน 800 โต๊ด 125
 // @match        https://www.keyhuay888.com/th/member/results*
 // @grant        GM_setClipboard
 // @run-at       document-idle
 // ==/UserScript==

 (() => {
   'use strict';

   const CFG = {
     straight3: 800,
     tod3: 125,
     timeout: 10000
   };

   const MAIN_ID = 'kh888-v73-main';
   const PANEL_ID = 'kh888-v73-panel';

   let busy = false;

   const sleep = ms =>
     new Promise(resolve => setTimeout(resolve, ms));

   const txt = el =>
     (el?.innerText || el?.textContent || '').trim();

   const norm = value =>
     String(value || '').replace(/\s+/g, '').toLowerCase();

   const fmt = value =>
     Number(value.toFixed(2)).toLocaleString('en-US', {
       minimumFractionDigits: 0,
       maximumFractionDigits: 2
     });

   function num(value) {
     const match = String(value || '')
       .replace(/,/g, '')
       .match(/[+-]?\d+(?:\.\d+)?/);

     return match ? Number(match[0]) : NaN;
   }

   function visible(el) {
     if (!el || !el.isConnected) return false;

     const rect = el.getBoundingClientRect();
     const style = getComputedStyle(el);

     return rect.width > 0 &&
       rect.height > 0 &&
       style.display !== 'none' &&
       style.visibility !== 'hidden';
   }

   async function waitFor(fn, timeout = CFG.timeout) {
     const start = Date.now();

     while (Date.now() - start < timeout) {
       const result = fn();
       if (result) return result;
       await sleep(150);
     }

     return null;
   }

   function dialogs() {
     return [...document.querySelectorAll('[role="dialog"]')]
       .filter(visible);
   }

   function summaryDialog() {
     return dialogs().find(dialog =>
       txt(dialog).includes('บิลของฉัน')
     );
   }

   // ========================================
   // ค้นหาชื่อหวยจาก HTML จริง
   // ========================================

   function findLotteryCards() {
     const results = [];
     const seen = new Set();

     const nameElements = [
       ...document.querySelectorAll(
         'span.truncate.text-sm.font-semibold.text-foreground'
       )
     ].filter(el =>
       visible(el) &&
       !el.closest('[role="dialog"]') &&
       !el.closest('#' + PANEL_ID)
     );

     for (const nameEl of nameElements) {
       const name = txt(nameEl).trim();

       if (!name || seen.has(nameEl)) continue;

       let node = nameEl.parentElement;
       let card = null;
       let eye = null;

       for (let i = 0; i < 12 && node; i++) {
         const content = txt(node);

         if (content.includes('แทงรวม')) {
           const buttons = [
             ...node.querySelectorAll('button')
           ].filter(btn =>
             visible(btn) && !btn.disabled
           );

           eye = buttons.find(btn => {
             const svg = btn.querySelector('svg');
             const cls = svg?.getAttribute('class') || '';

             return (
               cls.includes('lucide-eye') ||
               /ดูบิล|ดูรายการ/i.test(
                 (btn.getAttribute('aria-label') || '') +
                 (btn.getAttribute('title') || '')
               )
             );
           });

           if (!eye) {
             eye = buttons.find(btn =>
               !txt(btn) && btn.querySelector('svg')
             );
           }

           if (eye) {
             card = node;
             break;
           }
         }

         node = node.parentElement;
       }

       if (!card || !eye) continue;
       if (results.some(r => r.button === eye)) continue;

       seen.add(nameEl);

       results.push({
         id: results.length,
         name,
         element: card,
         button: eye
       });
     }

     return results;
   }

   // ========================================
   // อ่านรายการบิลที่ถูกรางวัล
   // ========================================

   function winTab(dialog) {
     return [...dialog.querySelectorAll(
       '[role="tab"],button'
     )].find(el => txt(el).includes('ถูกรางวัล'));
   }

   function summaryCards(dialog) {
     const list = [...dialog.querySelectorAll('ul')]
       .find(el =>
         el.className.includes('max-h-80') &&
         el.querySelector('li')
       );

     return list
       ? [...list.children].filter(el =>
           el.tagName === 'LI'
         )
       : [];
   }

   function customerName(card) {
     const detail = card.querySelector(
       'div.min-w-0.flex-1 p.text-xs'
     );

     const match = txt(detail).match(
       /ลูกค้า\s*[:：]\s*@?(.+?)(?=\s*[·•]\s*|แทงรวม|ถูกรางวัล|$)/i
     );

     return match
       ? match[1].replace(/^@+/, '').trim()
       : '';
   }

   function summaryWin(card) {
     return num(txt(
       card.querySelector('span.text-amber-600')
     ));
   }

   function viewButton(card) {
     return [...card.querySelectorAll('button')]
       .find(btn =>
         visible(btn) && /ดู/.test(txt(btn))
       );
   }

   // ========================================
   // อ่านรายละเอียดเลขที่ถูกรางวัล
   // ========================================

   const ROW_SELECTOR =
     'div.grid.grid-cols-\\[1fr_2\\.5rem_4rem_4rem_3\\.5rem\\]';

   function detailDialog(parent) {
     return dialogs().find(dialog =>
       dialog !== parent &&
       (
         dialog.querySelector('[data-ticket-item-full]') ||
         dialog.querySelector(ROW_SELECTOR)
       )
     );
   }

   function ticketRows(dialog) {
     return [...dialog.querySelectorAll(ROW_SELECTOR)]
       .filter(row =>
         row.querySelectorAll(':scope > span').length >= 5
       );
   }

   // ========================================
   // แก้ไขเรทจ่าย
   // 3 ตัวบน = 3 ตัวตรง
   // ========================================

   function rateType(label) {
     const value = norm(label);

     if (
       /3ตัวบน|3ตัวตรง|สามตัวบน|สามตัวตรง|3ตรง/.test(value)
     ) {
       return 'straight';
     }

     if (
       /3ตัวโต๊ด|3โต๊ด|สามตัวโต๊ด/.test(value)
     ) {
       return 'tod';
     }

     return 'other';
   }

   function winningMarker(row) {
     const next = row.nextElementSibling;

     if (next && /ถูกรางวัล/.test(txt(next))) {
       return next;
     }

     const parent = row.parentElement;

     if (
       parent &&
       /ถูกรางวัล/.test(txt(parent)) &&
       parent.querySelectorAll(ROW_SELECTOR).length === 1
     ) {
       return parent;
     }

     return null;
   }

   function readWinningRows(dialog) {
     const records = [];

     ticketRows(dialog).forEach(row => {
       if (!winningMarker(row)) return;

       const spans = [
         ...row.querySelectorAll(':scope > span')
       ];

       const label = txt(spans[0]);
       const stake = num(txt(spans[3]));
       const webRate = num(txt(spans[4]));

       if (
         !Number.isFinite(stake) ||
         !Number.isFinite(webRate) ||
         stake <= 0
       ) return;

       const type = rateType(label);

       const newRate =
         type === 'straight'
           ? CFG.straight3
           : type === 'tod'
             ? CFG.tod3
             : webRate;

       records.push({
         label,
         stake,
         webRate,
         newRate,
         oldAmount: stake * webRate,
         newAmount: stake * newRate
       });
     });

     return records;
   }

   // ========================================
   // โหลดรายการทั้งหมด
   // ========================================

   async function loadAllRows(dialog) {
     const scrollables = [
       ...dialog.querySelectorAll('*')
     ].filter(el =>
       el.scrollHeight > el.clientHeight + 40 &&
       el.clientHeight > 90
     );

     for (const el of scrollables.slice(0, 3)) {
       let previous = -1;
       let stable = 0;

       for (let i = 0; i < 40; i++) {
         const count = ticketRows(dialog).length;

         stable = count === previous
           ? stable + 1
           : 0;

         if (stable >= 3) break;

         previous = count;
         el.scrollTop = el.scrollHeight;

         await sleep(180);
       }

       el.scrollTop = 0;
     }
   }

   function closeDialog(dialog) {
     if (!dialog || !dialog.isConnected) return;

     const button = [
       ...dialog.querySelectorAll('button')
     ].find(btn =>
       /ปิด|close/i.test(
         txt(btn) + ' ' +
         (btn.getAttribute('aria-label') || '')
       ) ||
       btn.querySelector('svg.lucide-x')
     );

     if (button) button.click();
   }

   // ========================================
   // อ่านบิลและคำนวณใหม่
   // ========================================

   async function readOneBill(card, parent) {
     const name = customerName(card);
     const webTotal = summaryWin(card);
     const view = viewButton(card);

     if (!name || !Number.isFinite(webTotal) || !view) {
       throw new Error('อ่านข้อมูลบิลไม่ครบ');
     }

     view.click();

     const detail = await waitFor(() =>
       detailDialog(parent)
     );

     if (!detail) {
       throw new Error(
         `เปิดรายละเอียด @${name} ไม่สำเร็จ`
       );
     }

     try {
       await loadAllRows(detail);

       const rows = readWinningRows(detail);

       if (!rows.length) {
         throw new Error(
           `ไม่พบเลขที่ถูกของ @${name}`
         );
       }

       const oldTotal = rows.reduce(
         (sum, row) => sum + row.oldAmount, 0
       );

       if (Math.abs(oldTotal - webTotal) > 0.02) {
         throw new Error(
           `ยอด @${name} ไม่ตรง\n` +
           `เว็บ ${fmt(webTotal)} / ` +
           `อ่านได้ ${fmt(oldTotal)}`
         );
       }

       return {
         name,
         webTotal,
         adjusted: rows.reduce(
           (sum, row) => sum + row.newAmount, 0
         )
       };

     } finally {
       closeDialog(detail);
       await sleep(200);
     }
   }

   async function loadSummaryCards(dialog) {
     const tab = winTab(dialog);

     if (!tab) {
       throw new Error('ไม่พบแท็บถูกรางวัล');
     }

     tab.click();

     const ready = await waitFor(() =>
       summaryCards(dialog).length > 0
     );

     if (!ready) {
       throw new Error('ไม่พบรายการถูกรางวัล');
     }

     const list = summaryCards(dialog)[0]?.parentElement;

     if (list) {
       let previous = -1;
       let stable = 0;

       for (let i = 0; i < 35; i++) {
         const count = summaryCards(dialog).length;

         stable = count === previous
           ? stable + 1
           : 0;

         if (stable >= 3) break;

         previous = count;
         list.scrollTop = list.scrollHeight;
         await sleep(180);
       }

       list.scrollTop = 0;
     }

     return summaryCards(dialog).filter(card =>
       Number.isFinite(summaryWin(card)) &&
       summaryWin(card) > 0
     );
   }

   // ========================================
   // ประมวลผลหวยที่เลือก
   // ========================================

   async function processLottery(lottery, index, total) {
     setStatus(`⏳ หวย ${index + 1}/${total}`);

     if (!lottery.button?.isConnected) {
       throw new Error(
         `ไม่พบปุ่มของ ${lottery.name}`
       );
     }

     lottery.button.click();

     const parent = await waitFor(summaryDialog);

     if (!parent) {
       throw new Error(
         `เปิดบิล ${lottery.name} ไม่สำเร็จ`
       );
     }

     try {
       const cards = await loadSummaryCards(parent);
       const bills = [];

       for (let i = 0; i < cards.length; i++) {
         setStatus(
           `⏳ ตรวจบิล ${i + 1}/${cards.length}`
         );

         bills.push(
           await readOneBill(cards[i], parent)
         );
       }

       return {
         lottery: lottery.name,
         bills
       };

     } finally {
       closeDialog(parent);
       await sleep(200);
     }
   }

   // ========================================
   // สร้างข้อความสรุป
   // ========================================

   function summaryText(groups) {
     return groups.map(group => {
       const customers = new Map();

       group.bills.forEach(bill => {
         if (!customers.has(bill.name)) {
           customers.set(bill.name, []);
         }

         customers.get(bill.name).push(
           bill.adjusted
         );
       });

       const lines = [
         ...customers.entries()
       ].map(([name, amounts]) => {
         const total = amounts.reduce(
           (a, b) => a + b, 0
         );

         return (
           `@${name} ++ ${amounts.map(fmt).join('+')}` +
           (amounts.length > 1
             ? ` = ${fmt(total)}`
             : '')
         );
       });

       return groups.length > 1
         ? `${group.lottery}\n${lines.join('\n')}`
         : lines.join('\n');

     }).join('\n\n');
   }

   // ========================================
   // สร้างหน้าต่าง
   // ========================================

   function makePanel(title) {
     document.getElementById(PANEL_ID)?.remove();

     const panel = document.createElement('div');
     panel.id = PANEL_ID;

     panel.style.cssText = `
       position:fixed!important;
       right:20px!important;
       bottom:80px!important;
       width:380px!important;
       max-width:calc(100vw - 40px)!important;
       max-height:75vh!important;
       overflow:auto!important;
       z-index:2147483647!important;
       background:#fff!important;
       color:#222!important;
       padding:18px!important;
       border-radius:12px!important;
       box-shadow:0 6px 25px #0005!important;
       font:14px sans-serif!important;
     `;

     const heading = document.createElement('h3');
     heading.textContent = title;
     heading.style.margin = '0 0 12px';

     panel.appendChild(heading);
     document.body.appendChild(panel);

     return panel;
   }

   function addButton(panel, label, color, handler) {
     const button = document.createElement('button');
     button.textContent = label;

     button.style.cssText = `
       display:block!important;
       width:100%!important;
       padding:11px!important;
       margin-top:9px!important;
       background:${color}!important;
       color:white!important;
       border:0!important;
       border-radius:7px!important;
       cursor:pointer!important;
       font:bold 14px sans-serif!important;
     `;

     button.onclick = handler;
     panel.appendChild(button);

     return button;
   }

   function setStatus(value) {
     const button = document.getElementById(MAIN_ID);
     if (button) button.textContent = value;
   }

   // ========================================
   // แสดงยอดหลังปรับเรท
   // ========================================

   function showResult(groups) {
     const panel = makePanel(
       '📋 สรุปยอดถูก (เรทของเรา)'
     );

     const bills = groups.flatMap(g => g.bills);

     const oldTotal = bills.reduce(
       (sum, bill) => sum + bill.webTotal, 0
     );

     const newTotal = bills.reduce(
       (sum, bill) => sum + bill.adjusted, 0
     );

     const info = document.createElement('p');
     info.textContent =
       `เว็บ ${fmt(oldTotal)} บาท → ` +
       `เราจ่าย ${fmt(newTotal)} บาท`;

     panel.appendChild(info);

     const preview = document.createElement('textarea');
     preview.value = summaryText(groups);
     preview.readOnly = true;

     preview.style.cssText = `
       box-sizing:border-box;
       width:100%;
       height:210px;
       padding:10px;
       border:1px solid #ddd;
       border-radius:7px;
       font:13px sans-serif;
     `;

     panel.appendChild(preview);

     addButton(
       panel,
       '📋 คัดลอกยอดจ่ายใหม่',
       '#28a745',
       async () => {
         try {
           if (typeof GM_setClipboard === 'function') {
             GM_setClipboard(preview.value, 'text');
           } else {
             await navigator.clipboard.writeText(
               preview.value
             );
           }

           panel.remove();
           setStatus('✅ คัดลอกแล้ว');

           setTimeout(() => {
             setStatus('📋 สรุปยอดถูก');
           }, 2500);

         } catch (error) {
           alert(
             'คัดลอกไม่สำเร็จ: ' + error.message
           );
         }
       }
     );

     addButton(
       panel,
       '❌ ปิด',
       '#6c757d',
       () => panel.remove()
     );
   }

   async function runSelected(selected) {
     if (busy) return;
     busy = true;

     document.getElementById(PANEL_ID)?.remove();

     try {
       const groups = [];

       for (let i = 0; i < selected.length; i++) {
         groups.push(
           await processLottery(
             selected[i],
             i,
             selected.length
           )
         );
       }

       showResult(groups);

     } catch (error) {
       alert(
         'สรุปยอดไม่สำเร็จ:\n' +
         error.message +
         '\n\nระบบหยุดเพื่อป้องกันยอดผิด'
       );

     } finally {
       busy = false;
       setStatus('📋 สรุปยอดถูก');
     }
   }

   // ========================================
   // เลือกประเภทหวย
   // ========================================

   function showLotteryPicker() {
     if (busy) return;

     const old = document.getElementById(PANEL_ID);

     if (old) {
       old.remove();
       return;
     }


const lotteries = findLotteryCards()
  .filter(lottery => {
    // ตรวจสอบสถานะภายในการ์ดหวยแต่ละรายการ
    const cardText = txt(lottery.element);

    // ไม่เอาหวยที่ยังรอผล
    if (/รอผล/.test(cardText)) return false;

    // เลือกเฉพาะหวยที่มีสถานะถูกรางวัล
    return /ถูกรางวัล/.test(cardText);
  })
  .slice(0, 5);


     if (!lotteries.length) {
       alert(
         'ไม่พบการ์ดหวยบนหน้าเว็บ\n' +
         'กรุณารอให้หน้าเว็บโหลดข้อมูลครบ'
       );
       return;
     }

     const panel = makePanel(
       '🎯 เลือกหวยที่ต้องการสรุป'
     );

     const info = document.createElement('p');
     info.textContent =
       `แสดง ${lotteries.length} หวยล่าสุด`

     panel.appendChild(info);

     lotteries.forEach(lottery => {
       addButton(
         panel,
         lottery.name,
         '#007bff',
         () => runSelected([lottery])
       );
     });

     if (lotteries.length > 1) {
       addButton(
         panel,
         '📋 สรุปทุกหวย (แยกตามหวย)',
         '#28a745',
         () => runSelected(lotteries)
       );
     }

     addButton(
       panel,
       '❌ ปิด',
       '#6c757d',
       () => panel.remove()
     );
   }

   // ========================================
   // ปุ่มหลัก
   // ========================================

   function createMainButton() {
     if (!document.body ||
         document.getElementById(MAIN_ID)) return;

     const button = document.createElement('button');
     button.id = MAIN_ID;
     button.textContent = '📋 สรุปยอดถูก';

     button.style.cssText = `
       position:fixed!important;
       bottom:20px!important;
       right:20px!important;
       z-index:2147483646!important;
       padding:12px 22px!important;
       background:#28a745!important;
       color:white!important;
       border:0!important;
       border-radius:9px!important;
       font:bold 16px sans-serif!important;
       cursor:pointer!important;
       box-shadow:0 4px 12px #0004!important;
     `;

     button.onclick = showLotteryPicker;
     document.body.appendChild(button);
   }

   createMainButton();
   setInterval(createMainButton, 1500);

 })();
