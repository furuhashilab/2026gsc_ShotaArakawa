const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), fallback = root;
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
function mockSDK() {
  const admin = { id: 'affc8719-3bac-49ce-b251-24106f2929f4', email: 'admin@example.test' };
  const files = new Map();
  window.mock = { user: null, fail: false, delay: 0, uploads: [], downloads: [], revoked: [] };
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = url => { mock.revoked.push(url); revoke(url); };
  let authListener;
  mock.expire = () => { mock.user = null; authListener('SIGNED_OUT', null); };
  window.supabase = { createClient() { return {
    auth: {
      onAuthStateChange(fn) { authListener = fn; },
      async signInWithPassword() { mock.user = admin; return { data: { user: admin } }; },
      async getUser() { return { data: { user: mock.user } }; },
      async signOut() { mock.expire(); return {}; }
    },
    storage: { from(bucket) {
      if (bucket !== 'gyoda-private-photos') throw Error('Wrong bucket');
      return {
        async upload(key, blob, options) {
          mock.uploads.push({ key, size: blob.size, type: blob.type, options });
          await new Promise(r => setTimeout(r, mock.delay));
          if (!mock.user || mock.fail) return { error: { message: 'Denied/offline' } };
          if (files.has(key)) return { error: { message: 'Duplicate' } };
          files.set(key, blob); return { data: { path: key } };
        },
        async list(id, options) {
          if (!mock.user || mock.fail) return { error: { message: 'Denied/offline' } };
          const keys = [...files.keys()].filter(key => key.startsWith(id + '/'));
          return { data: keys.slice(options.offset, options.offset + options.limit).map(key => ({ name: key.split('/')[1], created_at: '2026-10-30T00:00:00Z' })) };
        },
        async download(key) {
          mock.downloads.push(key);
          await new Promise(r => setTimeout(r, mock.delay));
          return mock.user && !mock.fail && files.has(key) ? { data: files.get(key) } : { error: { message: 'Denied/offline' } };
        },
        createSignedUrl() { throw Error('Signed URLs are forbidden'); },
        getPublicUrl() { throw Error('Public URLs are forbidden'); }
      };
    } },
    from() { throw Error('Photos must not write card tables'); },
    rpc() { throw Error('Photos must not publish'); }
  }; } };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: (process.env.CHROME_PATH || undefined), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(mockSDK);
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/project/`;
    await page.goto(base + 'editor.html');
    await page.locator('#editor-layout').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#private-photo-file').isDisabled());
    const login = async () => {
      await page.fill('#cloud-email', 'admin@example.test'); await page.fill('#cloud-password', 'mock'); await page.click('#cloud-signin');
      await page.locator('#cloud-account').waitFor({ state: 'visible' });
    };
    await login();
    const originalPhoto = await page.inputValue('#edit-photo');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 1000;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#df8db4'; ctx.fillRect(0, 0, 1000, 1000); ctx.fillStyle = '#54917f'; ctx.fillRect(1000, 0, 1000, 1000);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const file = { name: 'original-secret-name.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
    await page.setInputFiles('#private-photo-file', file);
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('未送信'));
    await page.waitForFunction(() => document.querySelector('#private-photo-image').naturalWidth === 1600);
    assert.equal(await page.evaluate(() => mock.uploads.length), 0);
    await page.click('#private-photo-upload');
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('非公開で保存しました'));
    const uploaded = await page.evaluate(() => mock.uploads[0]);
    assert.match(uploaded.key, /^spot-001\/[0-9a-f-]{36}\.webp$/);
    assert.equal(uploaded.options.upsert, false); assert.equal(uploaded.type, 'image/webp');
    assert.equal(await page.inputValue('#edit-photo'), originalPhoto);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.click('#private-photo-clear');
    const filename = uploaded.key.split('/')[1];
    await page.selectOption('#private-photo-list', filename);
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('保存済みの非公開写真'));
    assert.ok((await page.getAttribute('#private-photo-image', 'src')).startsWith('blob:'));
    await page.waitForFunction(() => document.querySelector('#private-photo-image').naturalWidth === 1600);
    await page.locator('.private-photos').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'private-photo-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.private-photos').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(artifacts, 'private-photo-mobile.png') });
    await page.selectOption('#spot-select', 'spot-002');
    assert.equal(await page.locator('#private-photo-image').isVisible(), false);
    await page.click('#private-photo-refresh');
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('まだありません'));
    await page.selectOption('#spot-select', 'spot-001');
    await page.click('#private-photo-refresh');
    await page.waitForFunction(() => document.querySelector('#private-photo-list').options.length === 2);
    await page.selectOption('#private-photo-list', filename);
    await page.waitForFunction(() => document.querySelector('#private-photo-image').naturalWidth === 1600);
    await page.evaluate(() => mock.expire());
    assert.equal(await page.locator('#private-photo-image').isVisible(), false);
    assert.equal(await page.getAttribute('#private-photo-image', 'src'), null);
    assert.ok(await page.evaluate(() => mock.revoked.length >= 3));
    await login();
    await page.setInputFiles('#private-photo-file', { name: 'bad.heic', mimeType: 'image/heic', buffer: Buffer.from('bad') });
    await page.waitForFunction(() => document.querySelector('#private-photo-status').dataset.error === 'true');
    assert.ok(await page.locator('#private-photo-upload').isDisabled());
    await page.setInputFiles('#private-photo-file', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('読み取れません'));
    await page.setInputFiles('#private-photo-file', file);
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('未送信'));
    await page.evaluate(() => mock.fail = true);
    await page.click('#private-photo-upload');
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('保存の完了を確認できません'));
    await page.evaluate(() => mock.fail = false);
    await page.click('#private-photo-upload');
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('非公開で保存しました'));
    assert.equal(await page.evaluate(() => mock.uploads[1].key === mock.uploads[2].key), true);
    await page.setInputFiles('#private-photo-file', file);
    await page.waitForFunction(() => document.querySelector('#private-photo-status').textContent.includes('未送信'));
    await page.evaluate(() => mock.delay = 500);
    await page.click('#private-photo-upload');
    await page.selectOption('#spot-select', 'spot-002');
    await page.waitForFunction(() => !document.querySelector('#private-photo-refresh').disabled);
    assert.equal(await page.locator('#private-photo-image').isVisible(), false);
    assert.equal(await page.evaluate(() => mock.uploads.at(-1).key.startsWith('spot-001/')), true);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: private-only upload/download, no automatic upload/public URLs/table writes, resize, metadata-free naming, original card preserved, list, Blob cleanup, logout, failure retry, selection race, desktop/mobile');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
