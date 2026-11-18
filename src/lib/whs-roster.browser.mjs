import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), port = 30000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
const testAdminPassword = "browser-regression-only";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { cwd: root, env: { ...process.env, GOLF_SCORING_ADMIN_PASSWORD: testAdminPassword }, stdio: ["ignore", "pipe", "pipe"] });
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
  await call("Page.enable");
  const evaluate = async (expression) => { const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw Error(response.exceptionDetails.text); return response.result.value; };
  const waitFor = async (expression) => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); } throw Error(`Timed out: ${expression}`); };
  const reloadSeededTournament = async () => {
    // Seed fixture changes after pagehide flushes the current app state.
    const saved = await evaluate(`localStorage.getItem('system36:tournament:v1')`);
    const token = String(Date.now());
    const script = await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem('system36:tournament:v1', ${JSON.stringify(saved)}); window.__fixtureLoaded = ${JSON.stringify(token)};`,
    });
    await call("Page.reload");
    await waitFor(`window.__fixtureLoaded === ${JSON.stringify(token)} && document.readyState === 'complete'`);
    await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });
  };
  await waitFor(`!!document.querySelector('.whs-import-action button')`);
  assert.equal(await evaluate(`!!document.querySelector('.save-tournament-button, .load-data-button, .saved-tournament-list')`), false, "snapshot controls are hidden for normal users");
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
  const scoreFile = path.join(profile, "scores.csv");
  await writeFile(scoreFile, "Name," + Array.from({ length: 18 }, (_, i) => "H" + (i + 1)).join(",") + "\n" + Array.from({length:69},(_,i)=>"Unknown Player With A Long Name " + i + "," + Array(18).fill(i%2 ? "bad" : 4).join(",")).join("\n"));
  await call("Page.setInterceptFileChooserDialog", { enabled: true });
  for (const [width, height, scrolled] of [[1440,900,false], [1440,900,true], [1024,768,true], [768,1024,true], [960,600,true], [390,650,true]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(() => {
      const wrap = document.querySelector('.simple-score-table-wrap');
      wrap.scrollTop = ${scrolled ? 600 : 0};
      wrap.scrollLeft = ${scrolled ? 700 : 0};
      document.querySelector('.score-import-button').focus({preventScroll:true});
      document.querySelector('.score-import-button').click();
    })()`);
    const scoreDocument = await call("DOM.getDocument");
    const scoreInput = await call("DOM.querySelector", { nodeId: scoreDocument.root.nodeId, selector: ".score-import-input" });
    await call("DOM.setFileInputFiles", { nodeId: scoreInput.nodeId, files: [scoreFile] });
    await waitFor(`!!document.querySelector('.score-import-dialog:modal')`);
    const geometry = await evaluate(`(() => {
      const dialog = document.querySelector('.score-import-dialog');
      const rect = dialog.getBoundingClientRect();
      return {
        inBody: dialog.parentElement === document.body,
        visible: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        centered: Math.abs(rect.left + rect.width / 2 - document.documentElement.clientWidth / 2) < 2 && Math.abs(rect.top + rect.height / 2 - document.documentElement.clientHeight / 2) < 2,
        onTop: !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.score-import-dialog'),
        noOverflow: dialog.scrollWidth <= dialog.clientWidth + 1,
        focusInside: dialog.contains(document.activeElement),
        issueLayout: getComputedStyle(dialog.querySelector('.score-import-issues')).display,
      };
    })()`);
    assert.deepEqual(geometry, { inBody:true, visible:true, centered:true, onTop:true, noOverflow:true, focusInside:true, issueLayout:"grid" }, `Import modal at ${width}x${height}, scrolled=${scrolled}`);
    if (scrolled) {
      await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    } else await evaluate(`document.querySelector('.score-import-dialog .secondary-button').click()`);
    await waitFor(`!document.querySelector('.score-import-dialog') && !document.querySelector('.reset-backdrop') && !document.querySelector('dialog:modal')`);
  }
  await call("Page.setInterceptFileChooserDialog", { enabled: false });
  await call("Emulation.clearDeviceMetricsOverride");
  const fullBackupFile = path.join(profile, "full-backup.csv");
  const fullBackupRows = [
    ["Player Name", "Target 1–9", "Target 10–18", ...Array.from({ length: 18 }, (_, i) => "H" + (i + 1))],
    ["Browser Player 0", 40, 41, ...Array(18).fill("")],
    ["Browser Player 1", 42.5, 43, ...Array(9).fill(4), ...Array(9).fill("")],
    ["Browser Player 2", "", "", ...Array(18).fill(4)],
  ];
  await writeFile(fullBackupFile, fullBackupRows.map(row => row.join(",")).join("\r\n"));
  await evaluate(`(() => { const select = document.querySelector('[aria-label="Score import mode"]'); select.value = 'full-roster-scores'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const backupDocument = await call("DOM.getDocument");
  const backupInput = await call("DOM.querySelector", { nodeId: backupDocument.root.nodeId, selector: ".score-import-input" });
  await call("DOM.setFileInputFiles", { nodeId: backupInput.nodeId, files: [fullBackupFile] });
  await waitFor(`document.querySelector('.score-import-dialog .score-import-summary')?.textContent.includes('3 matched')`);
  assert.equal(await evaluate(`document.querySelector('.score-import-summary').textContent.includes('0 invalid')`), true);
  await evaluate(`document.querySelector('.score-import-dialog .primary-button').click()`);
  await waitFor(`!document.querySelector('.score-import-dialog')`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.score-table tbody tr')).slice(0,3).map(row => Array.from(row.querySelectorAll('.summary-cell')).map(cell => cell.textContent))`),
    [["—","—","—","—"], ["36","—","—","—"], ["36","36","72","70"]]);
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].jackpotTargetFront === 40`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][1].scores[17]`), null);
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
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].pairing === '1A'`);
  await call("Page.reload");
  await waitFor(`!!document.querySelector('.pairing-builder-open')`);
  assert.equal(await evaluate(`document.querySelector('.pairing-cell input').value`), "1A");
  await evaluate(`document.querySelector('.pairing-builder-open').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Remove Browser Player 0 from 1A"]')`);
  await evaluate(`document.querySelector('[aria-label="Remove Browser Player 0 from 1A"]').click()`);
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
  await waitFor(`Array.from(document.querySelectorAll('.pairing-builder-card')).some(c => c.textContent.includes('7A') && c.textContent.includes('Browser Player 0'))`);
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
  await reloadSeededTournament();
  await waitFor(`!!document.querySelector('.score-table .sticky-jackpot-back')`);
  assert.equal(await evaluate(`document.querySelector('.pairing-cell input').value`), "7A");
  await evaluate(`document.querySelector('.pairing-builder-open').click()`);
  await waitFor(`!!document.querySelector('.pairing-builder-dialog[open]')`);
  await waitFor(`document.querySelectorAll('.pairing-builder-card').length === 18`);
  const beforePairingImport = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1].map(({pairing,...player}) => player))`);
  const selectPairingFile = async (file) => {
    const document = await call("DOM.getDocument");
    const input = await call("DOM.querySelector", { nodeId: document.root.nodeId, selector: '[aria-label="Choose pairing import file"]' });
    await call("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
    await waitFor(`!!document.querySelector('.pairing-import-preview')`);
  };
  const pairingCsv = path.join(profile, "pairings.csv");
  await writeFile(pairingCsv, "Player Name,Group\nBrowser Player 0,9b\nUnknown Player,9A");
  await selectPairingFile(pairingCsv);
  assert.equal(await evaluate(`document.querySelector('.pairing-import-preview').textContent.includes('1 unmatched')`), true);
  assert.equal(await evaluate(`document.querySelector('.pairing-cell input').value`), "7A", "preview does not apply");
  await evaluate(`document.querySelector('.pairing-import-actions .secondary-button').click()`);
  await selectPairingFile(path.resolve("src/lib/fixtures/pairing-import.xlsx"));
  await evaluate(`document.querySelector('.pairing-import-actions .primary-button').click()`);
  await waitFor(`Array.from(document.querySelectorAll('.pairing-builder-card')).some(c => c.textContent.includes('8B') && c.textContent.includes('Browser Player 0'))`);
  await evaluate(`document.querySelector('[aria-label="Close Pairing Builder"]').click()`);
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].pairing === '8B'`);
  assert.equal(await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1].map(({pairing,...player}) => player))`), beforePairingImport);
  await call("Page.reload");
  await waitFor(`document.querySelector('.pairing-cell input')?.value === '8B'`);
  await evaluate(`Array.from(document.querySelectorAll('.score-sort-controls button')).find(b => b.textContent === 'Flight').click()`);
  await evaluate(`Array.from(document.querySelectorAll('.score-sort-controls button')).find(b => b.textContent.startsWith('Flight')).click()`);
  await waitFor(`document.querySelector('.player-name input')?.value !== 'Browser Player 0'`);
  await setInput('.player-search input', "Browser Player 0");
  await evaluate(`(() => { const select = document.querySelector('.pairing-filter select'); select.value = '8B'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 1`);
  await evaluate(`document.querySelector('.score-export-button').click()`);
  const exported = await evaluate(`(async () => {
    const originalCreate = URL.createObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    let csv, filename;
    URL.createObjectURL = (blob) => { csv = blob.text(); return 'blob:full-export-test'; };
    HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    try {
      Array.from(document.querySelectorAll('.score-export-options button')).find(b => b.textContent === 'Full Export').click();
      return { csv: await csv, filename };
    } finally {
      URL.createObjectURL = originalCreate;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  })()`);
  const fullRows = exported.csv.replace(/^\uFEFF/, "").split("\r\n").map(row => row.split(","));
  assert.equal(fullRows.length, 73, "Full Export includes the underlying 72-player roster despite filters");
  assert.ok(fullRows.every(row => row.length === 25), "Pairing and each hole occupy separate columns");
  assert.deepEqual(fullRows.slice(1).map(row => row[1]), roster.players.map(player => player.name), "Full Export follows roster order despite Flight sorting");
  assert.equal(fullRows[1][6], "8B");
  assert.equal(exported.filename, "Browser-Cup-Round-1-Full.csv");
  await setInput('.player-search input', "");
  await evaluate(`(() => { const select = document.querySelector('.pairing-filter select'); select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await evaluate(`Array.from(document.querySelectorAll('.score-sort-controls button')).find(b => b.textContent === 'Original').click()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 72`);
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
  await reloadSeededTournament();
  await waitFor(`document.querySelector('.awards-step') && document.querySelector('.tournament-summary-panel')?.textContent.includes('72')`);
  assert.equal(await evaluate(`document.querySelector('.tournament-summary-panel').textContent.includes('Flight D')`), true);
  assert.equal(await evaluate(`document.querySelector('.tournament-summary-panel').textContent.includes('Super Senior')`), true);
  assert.equal(await evaluate(`document.querySelector('.winner-results').textContent.includes('BGD')`), true);
  assert.equal(await evaluate(`document.querySelector('.winner-results').textContent.includes('BN 1 SS')`), true);
  const winnersPdf = await evaluate(`(async () => {
    const originalCreate = URL.createObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    let data;
    let resolveDownload;
    const downloaded = new Promise(resolve => { resolveDownload = resolve; });
    URL.createObjectURL = blob => { data = blob.arrayBuffer(); return 'blob:winners-pdf-test'; };
    HTMLAnchorElement.prototype.click = function () { resolveDownload(this.download); };
    try {
      Array.from(document.querySelectorAll('.winner-export-actions button')).find(button => button.textContent === 'Save as PDF').click();
      const filename = await downloaded;
      const bytes = new Uint8Array(await data);
      return { filename, size: bytes.length, header: new TextDecoder().decode(bytes.slice(0,5)) };
    } finally { URL.createObjectURL = originalCreate; HTMLAnchorElement.prototype.click = originalClick; }
  })()`);
  assert.equal(winnersPdf.filename, "Browser-Cup-Winners.pdf");
  assert.equal(winnersPdf.header, "%PDF-");
  assert.ok(winnersPdf.size > 1000);
  const awardsBeforeSnapshot = await evaluate(`document.querySelector('.winner-results').textContent`);
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate(`document.querySelector('.admin-mode-button').click()`);
  await waitFor(`!!document.querySelector('.admin-dialog')`);
  await setInput('.admin-dialog input', testAdminPassword);
  await evaluate(`document.querySelector('.admin-dialog button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('.save-tournament-button')`);
  for (let i = 0; i < 2; i++) {
    await evaluate(`document.querySelector('.save-tournament-button').click()`);
    await waitFor(`!!document.querySelector('.snapshot-dialog:modal')`);
    await setInput('.snapshot-dialog input', "Reusable Browser Cup");
    await evaluate(`document.querySelector('.snapshot-dialog button[type=submit]').click()`);
    await waitFor(`!document.querySelector('.snapshot-dialog')`);
  }
  const snapshots = await evaluate(`JSON.parse(localStorage.getItem('enkrypscore:saved-tournaments:v1'))`);
  assert.equal(snapshots.length, 2);
  assert.notEqual(snapshots[0].id, snapshots[1].id, "saving with the same name creates a new snapshot");
  await call("Page.reload");
  await waitFor(`!!document.querySelector('.load-data-button')`);
  await evaluate(`document.querySelector('.load-data-button').click()`);
  await waitFor(`document.querySelectorAll('.saved-tournament-list article').length === 2`);
  assert.ok(await evaluate(`document.querySelector('.load-data-dialog').textContent.includes('KBP & JNG Historical Data') && document.querySelector('.load-data-dialog').textContent.includes('Hendra Jaya')`));
  await evaluate(`document.querySelector('.saved-tournament-list details').open = true; document.querySelector('.saved-tournament-list details button').click()`);
  await waitFor(`!!document.querySelector('.snapshot-dialog:modal input')`);
  await setInput('.snapshot-dialog input', "Renamed Browser Cup");
  await evaluate(`document.querySelector('.snapshot-dialog button[type=submit]').click()`);
  await waitFor(`document.querySelector('.saved-tournament-list h4')?.textContent === 'Renamed Browser Cup'`);
  const activeBefore = await evaluate(`localStorage.getItem('system36:tournament:v1')`);
  await evaluate(`document.querySelector('.saved-tournament-list details').open = true; Array.from(document.querySelectorAll('.saved-tournament-list details button')).find(b=>b.textContent==='Delete').click()`);
  await waitFor(`!!document.querySelector('.snapshot-dialog:modal')`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('enkrypscore:saved-tournaments:v1')).length`), 2, "deletion requires confirmation");
  await evaluate(`document.querySelector('.snapshot-dialog .reset-confirm-button').click()`);
  await waitFor(`document.querySelectorAll('.saved-tournament-list article').length === 1`);
  assert.equal(await evaluate(`localStorage.getItem('system36:tournament:v1')`), activeBefore);
  await evaluate(`document.querySelector('.saved-tournament-list .primary-button').click()`);
  await waitFor(`!!document.querySelector('[aria-labelledby="replace-data-title"]')`);
  await evaluate(`document.querySelector('[aria-labelledby="replace-data-title"] .secondary-button').click()`);
  assert.equal(await evaluate(`localStorage.getItem('system36:tournament:v1')`), activeBefore);
  await evaluate(`document.querySelector('.awards-back-button').click()`);
  await waitFor(`!!document.querySelector('.score-heading-actions button')`);
  await setInput('.player-name input', "EDITED WORKING COPY");
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].name === 'EDITED WORKING COPY'`);
  await evaluate(`document.querySelector('.load-data-button').click()`);
  await waitFor(`!!document.querySelector('.saved-tournament-list article')`);
  await evaluate(`document.querySelector('.saved-tournament-list .primary-button').click()`);
  await waitFor(`!!document.querySelector('[aria-labelledby="replace-data-title"]')`);
  await evaluate(`document.querySelector('[aria-labelledby="replace-data-title"] .reset-confirm-button').click()`);
  await waitFor(`!!document.querySelector('.awards-step') && !document.querySelector('[aria-labelledby="replace-data-title"]')`);
  await waitFor(`JSON.parse(localStorage.getItem('system36:tournament:v1')).tournamentScores[1][0].name === 'Browser Player 0'`);
  const loaded = await evaluate(`JSON.parse(localStorage.getItem('system36:tournament:v1'))`);
  assert.deepEqual(loaded.tournamentScores, snapshots[1].state.tournamentScores);
  assert.deepEqual(loaded.courseData, snapshots[1].state.courseData);
  assert.deepEqual(loaded.pairingGroups, snapshots[1].state.pairingGroups);
  assert.deepEqual(loaded.jackpot, snapshots[1].state.jackpot);
  assert.equal(await evaluate(`document.querySelector('.winner-results').textContent`), awardsBeforeSnapshot);
  await evaluate(`document.querySelector('.load-data-button').click()`);
  await waitFor(`!!document.querySelector('.load-data-dialog')`);
  await evaluate(`document.querySelector('.load-data-dialog > article .primary-button').click()`);
  await waitFor(`!!document.querySelector('[aria-labelledby="replace-data-title"]')`);
  await evaluate(`document.querySelector('[aria-labelledby="replace-data-title"] .reset-confirm-button').click()`);
  await waitFor(`document.querySelectorAll('.score-table tbody tr').length === 40`);
  assert.equal(await evaluate(`document.querySelectorAll('.round-tabs button').length`), 2, "historical fixture still loads after snapshots");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('enkrypscore:saved-tournaments:v1')).length`), 1);
  await call("Network.clearBrowserCookies");
  await evaluate(`document.querySelector('.save-tournament-button').click()`);
  await waitFor(`!!document.querySelector('.snapshot-dialog:modal')`);
  await evaluate(`document.querySelector('.snapshot-dialog button[type=submit]').click()`);
  await waitFor(`!document.querySelector('.save-tournament-button')`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('enkrypscore:saved-tournaments:v1')).length`), 1, "expired Admin session cannot save snapshots");
  await waitFor(`!document.querySelector('.save-tournament-button') && !document.querySelector('.load-data-button')`);
  console.log("PASS browser: Admin snapshot visibility, save/refresh, rename/delete, replacement confirmation, restored results, historical loaders, expired-session rejection, and existing import/export regressions");
} finally {
  socket?.close(); chrome.kill(); server.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
