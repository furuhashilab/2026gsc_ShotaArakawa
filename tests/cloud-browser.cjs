const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fallback = root;
const artifacts = path.join(root, 'test-artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/project\//, '');
  if (relative.includes('..') || relative.includes('\\') || relative.startsWith('/')) return res.writeHead(404).end();
  const file = [root, fallback].map(base => path.join(base, relative)).find(f => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
function installMock() {
  const admin = { id: 'affc8719-3bac-49ce-b251-24106f2929f4', email: 'admin@example.test' };
  window.mock = { rows: {}, published: {}, states: {}, rpcCalls: 0, conflict: false, fail: false, delay: 0, admin: true, user: null };
  window.supabase = { createClient(url, key, options) {
    window.mock.options = options;
    let listener;
    return {
      auth: {
        onAuthStateChange(fn) { listener = fn; },
        async signInWithPassword() { mock.user = mock.admin ? admin : { id: 'other' }; return { data: { user: mock.user } }; },
        async getUser() { return { data: { user: mock.user } }; },
        async signOut() { mock.user = null; listener('SIGNED_OUT', null); return {}; }
      },
      async rpc(name, args) {
        mock.rpcCalls++;
        const id = args.p_spot_id;
        const state = mock.states[id] || { revision: 0, previous_content: null, undo_available: false };
        if (mock.conflict || args.p_expected_revision !== state.revision) return { error: { code: '40001' } };
        if (name === 'publish_spot_card') {
          state.previous_content = mock.published[id] || null;
          state.undo_available = true;
          mock.published[id] = structuredClone(args.p_expected_draft);
        } else if (name === 'undo_spot_publication') {
          if (!state.undo_available) return { error: { message: 'No undo' } };
          if (state.previous_content) mock.published[id] = state.previous_content;
          else delete mock.published[id];
          state.previous_content = null;
          state.undo_available = false;
        } else throw Error('Unexpected RPC');
        state.revision++;
        mock.states[id] = state;
        return { data: { spot_id: id, revision: state.revision, changed: true } };
      },
      from(table) {
        if (!['spot_content_drafts', 'spot_publication_state', 'spot_content_published', 'spot_photo_drafts'].includes(table)) throw Error('Wrong table');
        let draft, id;
        return {
          upsert(row) { draft = row; return this; },
          select(columns) {
            if (!['spot_publication_state','spot_photo_drafts'].includes(table) && columns !== 'spot_id,name,description,photo,youtube2,youtube,homepage') throw Error('Missing media columns');
            return this;
          },
          eq(field, value) { id = value; return this; },
          async single() {
            await new Promise(r => setTimeout(r, mock.delay));
            if (mock.fail) return { error: { message: 'TEST network error' } };
            mock.rows[draft.spot_id] = structuredClone(draft);
            return { data: draft };
          },
          async maybeSingle() {
            if (table === 'spot_photo_drafts') return { data:null };
            await new Promise(r => setTimeout(r, mock.delay));
            const records = table === 'spot_publication_state' ? mock.states : table === 'spot_content_published' ? mock.published : mock.rows;
            return mock.fail ? { error: { message: 'TEST network error' } } : { data: structuredClone(records[id] || null) };
          }
        };
      }
    };
  } };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: (process.env.CHROME_PATH || undefined), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(installMock);
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/project/editor.html`);
    await page.locator('#editor-layout').waitFor({ state: 'visible' });
    const login = async () => {
      await page.fill('#cloud-email', 'admin@example.test');
      await page.fill('#cloud-password', 'mock-only');
      await page.click('#cloud-signin');
    };
    await page.evaluate(() => mock.admin = false);
    await login();
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('管理者権限がありません'));
    assert.equal(await page.locator('#cloud-account').isVisible(), false);
    await page.evaluate(() => mock.admin = true);
    await login();
    await page.locator('#cloud-account').waitFor({ state: 'visible' });
    assert.equal(await page.inputValue('#cloud-password'), '');
    assert.equal(await page.evaluate(() => mock.options.auth.persistSession), false);
    await page.click('#cloud-load');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('まだありません'));
    const media = {
      photo: 'assets/test-photo.png',
      youtube2: 'https://www.youtube.com/shorts/abcdefghijk',
      youtube: 'https://www.youtube.com/watch?v=lmnopqrstuv',
      homepage: 'https://example.test/spot'
    };
    for (const [field, value] of Object.entries(media)) await page.fill('#edit-' + field, value);
    await page.fill('#edit-name', 'Online test');
    await page.fill('#edit-desc', 'Description test');
    await page.click('#cloud-save');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('保存しました'));
    const row = await page.evaluate(() => mock.rows['spot-001']);
    assert.deepEqual(Object.keys(row).sort(), ['description', 'homepage', 'name', 'owner_id', 'photo', 'spot_id', 'youtube', 'youtube2']);
    for (const [field, value] of Object.entries(media)) assert.equal(row[field], value);
    assert.equal(row.name, 'Online test');
    assert.equal(await page.evaluate(() => localStorage.getItem('gyoda-spot-editor-draft-v1')), null);
    await page.fill('#edit-name', 'Local edit');
    for (const field of Object.keys(media)) await page.fill('#edit-' + field, '');
    await page.click('#cloud-load');
    await page.waitForFunction(() => document.querySelector('#edit-name').value === 'Online test');
    for (const [field, value] of Object.entries(media)) assert.equal(await page.inputValue('#edit-' + field), value);
    assert.match(await page.textContent('#save-state'), /未保存の変更あり/);
    // NULL legacy fields keep local values, whereas empty strings clear them.
    await page.evaluate(() => {
      for (const field of ['photo', 'youtube2', 'youtube', 'homepage']) mock.rows['spot-001'][field] = null;
    });
    await page.click('#cloud-load');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('現在の入力を保持'));
    for (const [field, value] of Object.entries(media)) assert.equal(await page.inputValue('#edit-' + field), value);
    for (const field of Object.keys(media)) await page.fill('#edit-' + field, '');
    await page.click('#cloud-save');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('保存しました'));
    for (const field of Object.keys(media)) assert.equal(await page.evaluate(field => mock.rows['spot-001'][field], field), '');
    for (const [field, value] of Object.entries(media)) await page.fill('#edit-' + field, value);
    await page.click('#cloud-load');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('読み込みました'));
    for (const field of Object.keys(media)) assert.equal(await page.inputValue('#edit-' + field), '');
    // Invalid local values must not reach the database.
    const before = await page.evaluate(() => JSON.stringify(mock.rows));
    for (const [field, invalid] of [['photo', 'javascript:alert(1)'], ['youtube2', 'https://example.test/not-youtube'], ['youtube', 'https://youtube.com.evil.test/watch?v=abcdefghijk'], ['homepage', 'x'.repeat(2001)]]) {
      await page.evaluate(({field, invalid}) => {
        const input = document.getElementById('edit-' + field);
        input.value = invalid;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, { field, invalid });
      await page.click('#cloud-save');
      await page.waitForFunction(() => document.querySelector('#cloud-status').dataset.error === 'true');
      assert.equal(await page.evaluate(() => JSON.stringify(mock.rows)), before);
      await page.fill('#edit-' + field, '');
    }
    // Invalid server data must not partially overwrite the current card.
    await page.evaluate(() => { mock.rows['spot-001'].name = 'Should not apply'; mock.rows['spot-001'].photo = 'javascript:alert(1)'; });
    await page.click('#cloud-load');
    await page.waitForFunction(() => document.querySelector('#cloud-status').dataset.error === 'true');
    assert.equal(await page.inputValue('#edit-name'), 'Online test');
    assert.equal(await page.inputValue('#edit-photo'), '');
    await page.evaluate(() => mock.rows['spot-001'].photo = '');
    await page.evaluate(() => mock.fail = true);
    await page.fill('#edit-name', 'Preserve on failure');
    await page.click('#cloud-save');
    await page.waitForFunction(() => document.querySelector('#cloud-status').dataset.error === 'true');
    assert.equal(await page.inputValue('#edit-name'), 'Preserve on failure');
    await page.evaluate(() => { mock.fail = false; mock.delay = 400; });
    await page.click('#cloud-load');
    await page.selectOption('#spot-select', 'spot-002');
    const secondName = await page.inputValue('#edit-name');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('中止しました'));
    assert.equal(await page.inputValue('#edit-name'), secondName);
    await page.selectOption('#spot-select', 'spot-001');
    await page.evaluate(row => { mock.delay = 0; mock.rows['spot-001'] = { ...row, name: 'Published A' }; }, row);
    await page.fill('#edit-name', 'UNSAVED DO NOT PUBLISH');
    await page.click('#publication-review');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    assert.match(await page.textContent('#publication-target'), /Published A/);
    assert.equal(await page.evaluate(() => mock.rpcCalls), 0);
    await page.click('#publication-cancel');
    assert.equal(await page.evaluate(() => mock.rpcCalls), 0);
    await page.click('#publication-review');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifacts, 'publication-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => { const d = document.querySelector('#publication-dialog'); return d.scrollWidth <= d.clientWidth && d.getBoundingClientRect().right <= innerWidth; }));
    await page.screenshot({ path: path.join(artifacts, 'publication-mobile.png'), fullPage: true });
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('を公開しました'));
    assert.equal(await page.evaluate(() => mock.published['spot-001'].name), 'Published A');
    assert.equal(await page.inputValue('#edit-name'), 'UNSAVED DO NOT PUBLISH');
    await page.evaluate(() => mock.rows['spot-001'].name = 'Published B');
    await page.click('#publication-review');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    await page.evaluate(() => mock.conflict = true);
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('もう一度内容を確認'));
    assert.equal(await page.evaluate(() => mock.published['spot-001'].name), 'Published A');
    await page.evaluate(() => mock.conflict = false);
    await page.click('#publication-review');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('を公開しました'));
    assert.equal(await page.evaluate(() => mock.published['spot-001'].name), 'Published B');
    await page.click('#publication-undo');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    assert.match(await page.textContent('#publication-target'), /Published A/);
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('公開を取り消しました'));
    assert.equal(await page.evaluate(() => mock.published['spot-001'].name), 'Published A');
    await page.click('#publication-undo');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('取り消せる公開はありません'));
    await page.evaluate(() => { delete mock.published['spot-001']; delete mock.states['spot-001']; });
    await page.click('#publication-review');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('を公開しました'));
    await page.click('#publication-undo');
    await page.locator('#publication-dialog').waitFor({ state: 'visible' });
    assert.match(await page.textContent('#publication-note'), /元のJSON/);
    await page.click('#publication-confirm');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('公開を取り消しました'));
    assert.equal(await page.evaluate(() => mock.published['spot-001']), undefined);
    await page.evaluate(() => mock.rows['spot-001'].photo = null);
    await page.click('#publication-review');
    await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('6項目をオンライン保存'));
    assert.equal(await page.locator('#publication-dialog').isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
    await page.click('#cloud-signout');
    await page.locator('#cloud-login').waitFor({ state: 'visible' });
    await page.click('#save-draft');
    assert.ok(await page.evaluate(() => localStorage.getItem('gyoda-spot-editor-draft-v1')));
    assert.deepEqual(errors, []);
    console.log('PASS: publication preview/cancel, saved-only publish, conflict handling, undo, first-publication undo, legacy rejection, desktop/mobile dialog, plus existing cloud draft checks');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
