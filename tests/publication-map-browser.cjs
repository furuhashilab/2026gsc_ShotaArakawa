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
  res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: (process.env.CHROME_PATH || undefined), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let mode = 'published', requests = 0;
    await context.route('**/rest/v1/spot_content_published?*', route => {
      requests++;
      return mode === 'offline' ? route.abort() : route.fulfill({ contentType: 'application/json', body: JSON.stringify(mode === 'empty' ? [] : [{ spot_id: 'spot-001', name: '公開テストの古代蓮', description: '公開済みの説明文', photo: '', youtube2: '', youtube: '', homepage: '' }]) });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/main.js?*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'main.js'), 'utf8').replace('map.addControl(', 'globalThis.__map = map;\nmap.addControl(') }));
    const base = `http://127.0.0.1:${server.address().port}/project/`;
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.route-stop-name') && [...document.querySelectorAll('.route-stop-name')].some(el => el.textContent === '公開テストの古代蓮'), null, { timeout: 60000 });
    await page.click('[data-spot-id="spot-001"]');
    assert.equal(await page.textContent('#spot-panel .popup-title'), '公開テストの古代蓮');
    assert.equal(await page.textContent('#spot-panel .popup-desc'), '公開済みの説明文');
    await page.waitForFunction(() => globalThis.__map?.loaded(), null, { timeout: 60000 });
    await page.screenshot({ path: path.join(artifacts, 'public-map-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, 'public-map-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    mode = 'offline';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('.route-stop-name')].some(el => el.textContent === '古代蓮の里'));
    mode = 'empty';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('.route-stop-name')].some(el => el.textContent === '古代蓮の里'));
    const spots = JSON.parse(fs.readFileSync(path.join(root, 'data/spots.json'), 'utf8'));
    spots[0].name = '未公開プレビューの蓮';
    await page.evaluate(spots => localStorage.setItem('gyoda-map-preview-v1', JSON.stringify({ version: 1, id: 'preview-publication-test', returnPage: 'editor.html', spots, geojson: { type: 'FeatureCollection', features: [] } })), spots);
    mode = 'published';
    const before = requests;
    await page.goto(base + 'index.html?preview=preview-publication-test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('.route-stop-name')].some(el => el.textContent === '未公開プレビューの蓮'));
    assert.equal(requests, before);
    assert.deepEqual(errors, []);
    console.log('PASS: public map card/route names, desktop/mobile rendering, offline fallback, first-publication undo fallback, preview isolation');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
