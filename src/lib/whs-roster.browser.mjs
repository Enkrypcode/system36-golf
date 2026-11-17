import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), port = 30000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverError = "";
server.stderr.on("data", (chunk) => { serverError += String(chunk); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const testRoot = path.resolve("test-results");
await mkdir(testRoot, { recursive: true });
const profile = await mkdtemp(path.join(testRoot, "whs-roster-browser-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, base], { stdio: "ignore" });
let socket;
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(100); if (attempt === 99) throw Error(`Local scoring server did not start: ${serverError.slice(-500)}`); }
  let debugPort;
  for (let attempt = 0; attempt < 100; attempt++) { try { debugPort = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await sleep(100); } }
  assert.ok(debugPort, "Chrome debugging endpoint started");
  const tabs = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
  const tab = tabs.find((item) => item.type === "page" && item.url.startsWith(base));
  assert.ok(tab, "Scoring app opened");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map();
  socket.onmessage = ({ data }) => { const message = JSON.parse(data); if (message.method === "Runtime.exceptionThrown") console.error(JSON.stringify(message.params)); if (!message.id) return; const task = pending.get(message.id); if (!task) return; pending.delete(message.id); if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result); };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await call("Runtime.enable");
  const evaluate = async (expression) => { const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw Error(response.exceptionDetails.text); return response.result.value; };
  const waitFor = async (expression) => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); } throw Error(`Timed out: ${expression}`); };
  await waitFor(`!!document.querySelector('.whs-import-action button')`);
  await sleep(1000);
  const roster = { format: "whs-play-setup-v1", tournamentName: "Browser Cup", playDate: "2026-11-11", course: "Course requiring manual match", flightFormat: "A-D",
    players: Array.from({ length: 72 }, (_, index) => ({ playerId: `browser-${index}`, name: `Browser Player ${index}`, handicap: index === 0 ? 18 : index % 29, flight: ["A", "B", "C", "D", "SS"][index % 5], tee: "White" })) };
  const selectFile = async (payload) => {
    const file = path.join(profile, "roster.json");
    await writeFile(file, JSON.stringify(payload));
    const document = await call("DOM.getDocument");
    const input = await call("DOM.querySelector", { nodeId: document.root.nodeId, selector: ".whs-import-action input[type=file]" });
    await call("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
    await evaluate(`document.querySelector('.whs-import-action input[type=file]').dispatchEvent(new Event('change', {bubbles:true}))`);
  };
  await selectFile(roster);
  await sleep(500);
  await waitFor(`document.querySelectorAll('.whs-roster-list tbody tr').length === 72`);
  assert.equal(await evaluate(`document.querySelector('.whs-roster-dialog').textContent.includes('Choose the course manually')`), true);
  await evaluate(`document.querySelector('.whs-roster-dialog .primary-button').click()`);
  await waitFor(`document.querySelector('.round-setup-list input[readonly]')?.value === '72'`);
  assert.equal(await evaluate(`document.querySelector('.wide-field input').value`), "Browser Cup");
  await evaluate(`(() => { const input=document.querySelector('.round-setup [role=combobox]'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Alpine Golf Club'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor(`document.querySelector('.course-results [role=option]')?.textContent.includes('Alpine Golf Club')`);
  await evaluate(`document.querySelector('.course-results [role=option]').click()`);
  await waitFor(`document.querySelector('.round-setup-list input[readonly]')?.value === '72' && !document.querySelector('.step-action .primary-button').disabled`);
  await evaluate(`document.querySelector('.step-action .primary-button').click()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 72`);
  const setInput = async (selector, value) => {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  await evaluate(`document.querySelector('.pairing-builder-open').click()`);
  await waitFor(`!!document.querySelector('.pairing-builder-dialog[open]')`);
  assert.equal(await evaluate(`document.querySelector('.pairing-builder-summary').textContent.includes('72 Unassigned')`), true);
  await setInput('[aria-label="New pairing code"]', "1a");
  await evaluate(`document.querySelector('.pairing-builder-create form button').click()`);
  await setInput('[aria-label="Search players for 1A"]', "browser player 0");
  await evaluate(`document.querySelector('.pairing-picker-results button').click()`);
  await evaluate(`Array.from(document.querySelectorAll('.pairing-builder-dialog footer button')).find(b => b.textContent === 'Cancel').click()`);
  assert.equal(await evaluate(`document.querySelector('.pairing-cell input').value`), "");
  await evaluate(`document.querySelector('.pairing-builder-open').click()`);
  await evaluate(`document.querySelector('.pairing-builder-create details').open = true; document.querySelector('.pairing-builder-create details button').click()`);
  await waitFor(`document.querySelectorAll('.pairing-builder-card').length === 18`);
  await setInput('[aria-label="New pairing code"]', "1a");
  await evaluate(`document.querySelector('.pairing-builder-create form button').click()`);
  assert.equal(await evaluate(`document.querySelector('.pairing-builder-create [role=alert]').textContent.includes('already exists')`), true);
  await setInput('[aria-label="Search players for 1A"]', "browser player 0");
  await evaluate(`document.querySelector('.pairing-picker-results button').click()`);
  await waitFor(`document.querySelector('.pairing-builder-summary').textContent.includes('1 Assigned')`);
  await evaluate(`document.querySelector('[aria-label="Remove Browser Player 0 from 1A"]').click()`);
  await waitFor(`document.querySelector('.pairing-builder-summary').textContent.includes('72 Unassigned')`);
  await setInput('[aria-label="Search players for 2B"]', "browser player 0");
  await evaluate(`document.querySelector('.pairing-picker-results button').click()`);
  await evaluate(`document.querySelector('.pairing-builder-dialog footer .primary-button').click()`);
  await waitFor(`document.querySelector('.pairing-cell input').value === '2B'`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.pairing-filter option')).some(o => o.value === '2B')`), true);
  await evaluate(`(() => { const select = document.querySelector('.pairing-filter select'); select.value = '2B'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 1`);
  await evaluate(`(() => { const select = document.querySelector('.pairing-filter select'); select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 72`);
  await evaluate(`Array.from(document.querySelectorAll('.score-sort-controls button')).find(b => b.textContent === 'Pairing').click()`);
  await waitFor(`document.querySelector('.pairing-cell input').value === '2B'`);
  await setInput('.pairing-cell input', "7A");
  await evaluate(`document.querySelector('.pairing-builder-open').click()`);
  await waitFor(`document.querySelector('.pairing-builder-card')?.textContent.includes('7A')`);
  assert.equal(await evaluate(`document.querySelector('.pairing-builder-card').textContent.includes('Browser Player 0')`), true);
  for (const width of [1280, 768, 390]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate(`(() => {
      const dialog = document.querySelector('.pairing-builder-dialog');
      return dialog.scrollWidth <= dialog.clientWidth + 1 && dialog.getBoundingClientRect().height <= innerHeight &&
        document.activeElement.closest('dialog') === dialog;
    })()`), true, `Pairing Builder fits and retains focus at ${width}px`);
  }
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate(`document.querySelector('[aria-label="Close Pairing Builder"]').click()`);
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1'))?.step === 2`);
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].pairing === '7A'`);
  await evaluate(`(() => {
    const key = 'system36:tournament:v1', saved = JSON.parse(localStorage.getItem(key));
    saved.jackpot = { enabled: true, mode: 'blind-hole', blindHoles: [2, 4, 11, 13], locked: true, revealed: false };
    localStorage.setItem(key, JSON.stringify(saved));
  })()`);
  await call("Page.reload");
  await waitFor(`!!document.querySelector('.score-table .sticky-jackpot-back')`);
  assert.equal(await evaluate(`document.querySelector('.pairing-cell input').value`), "7A");
  for (const width of [1440, 1024, 768, 390]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: false });
    const reachable = await evaluate(`(() => {
      const wrap = document.querySelector('.simple-score-table-wrap');
      const row = wrap.querySelector('tbody tr');
      const heads = Array.from(wrap.querySelectorAll('.column-row th'));
      wrap.scrollTop = 160;
      return ['1', '18', 'Front', 'Back', 'Gross', 'Nett'].filter(label => {
        const i = heads.findIndex(h => h.textContent === label);
        const cell = row.cells[i];
        const left = wrap.getBoundingClientRect().left + wrap.clientLeft;
        wrap.scrollLeft += cell.getBoundingClientRect().right - left - wrap.clientWidth;
        const rect = cell.getBoundingClientRect(), head = heads[i].getBoundingClientRect();
        return getComputedStyle(wrap).overflowX === 'auto' && wrap.scrollTop > 0 &&
          rect.left >= row.cells[1].getBoundingClientRect().right - 1 &&
          rect.right <= left + wrap.clientWidth + 1 && Math.abs(head.left - rect.left) < 1 &&
          head.top >= wrap.getBoundingClientRect().top - 1;
      });
    })()`);
    assert.deepEqual(reachable, ["1", "18", "Front", "Back", "Gross", "Nett"], `reachable columns at ${width}px`);
  }
  await call("Emulation.clearDeviceMetricsOverride");
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.score-table thead th')).some((th) => th.textContent === 'Flight')`), true);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.award-category-cell input')).some((input) => input.value === 'D')`), true);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.award-category-cell input')).some((input) => input.value === 'SS')`), true);
  await evaluate(`Array.from(document.querySelectorAll('.score-sort-controls button')).find((button) => button.textContent === 'Flight').click()`);
  await waitFor(`Array.from(document.querySelectorAll('.award-category-cell input')).slice(0,5).every((input) => input.value === 'A')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.award-category-cell input')).at(-1).value`), "SS");
  await evaluate(`document.querySelector('.score-heading-actions button').click()`);
  await waitFor(`!!document.querySelector('.whs-import-action button')`);
  await selectFile(roster);
  await waitFor(`document.querySelector('.whs-roster-dialog')?.textContent.includes('already imported')`);
  assert.equal(await evaluate(`document.querySelector('.whs-roster-dialog .primary-button').disabled`), false);
  await evaluate(`document.querySelector('.whs-roster-dialog .primary-button').click()`);
  await selectFile({ ...roster, tournamentName: "Different Cup" });
  await waitFor(`document.querySelector('.whs-roster-dialog')?.textContent.includes('Use New Tournament first')`);
  assert.equal(await evaluate(`document.querySelector('.whs-roster-dialog .primary-button').disabled`), true);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.querySelector('.whs-roster-dialog').getBoundingClientRect().width <= innerWidth`), true);
  await evaluate(`document.querySelector('.whs-roster-dialog .secondary-button').click()`);
  await sleep(500);
  await evaluate(`(() => { const key='system36:tournament:v1'; const saved=JSON.parse(localStorage.getItem(key)); saved.step=3; saved.tournamentScores[1]=saved.tournamentScores[1].map((player,index)=>({...player,scores:Array(18).fill(4).map((score,hole)=>hole===0?score+index%3:score)})); localStorage.setItem(key,JSON.stringify(saved)); })()`);
  await call("Page.reload");
  await waitFor(`document.querySelector('.awards-step') && document.querySelector('.tournament-summary-panel')?.textContent.includes('72')`);
  assert.equal(await evaluate(`document.querySelector('.tournament-summary-panel').textContent.includes('Flight D')`), true);
  assert.equal(await evaluate(`document.querySelector('.tournament-summary-panel').textContent.includes('Super Senior')`), true);
  assert.equal(await evaluate(`document.querySelector('.winner-results').textContent.includes('BGD')`), true);
  assert.equal(await evaluate(`document.querySelector('.winner-results').textContent.includes('BN 1 SS')`), true);
  console.log("PASS WHS roster browser: Pairing Builder create/assign/move/cancel/apply, filter/sort/manual edit/refresh, responsive modal, score scrolling, WHS import and Winners");
} finally {
  socket?.close(); chrome.kill(); server.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
