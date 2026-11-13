// Integration checks: real Chromium extension, isolated profile, mocked site responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const core = require('../core.js');
const dir = path.join(__dirname, '..');
const tags = JSON.parse(fs.readFileSync(path.join(dir, 'tags.json'), 'utf8')).tags;
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.host_permissions, ['https://civitai.com/*', 'https://civitai.red/*']);
assert.deepEqual(manifest.content_scripts[0].matches, manifest.host_permissions);
for (const icon of Object.values(manifest.icons)) assert(fs.existsSync(path.join(dir, icon)));
assert.equal(core.suggest('woman', tags)[0].id, 5133);
assert.equal(core.suggest('sunset', tags)[0].id, 3257);
assert.equal(core.suggest('cyberpunk', tags)[0].id, 499);
assert(core.suggest('womna', tags).some(t => t.id === 5133));
assert(core.suggest('women', tags).some(t => t.id === 5133 && t.kind === 'related'));
assert(core.suggest('futuristic', tags).some(t => t.id === 499));
assert.doesNotThrow(() => core.suggest('constructor', tags));
assert.doesNotThrow(() => core.suggest('constructor woman', tags));
assert.equal(core.suggest('__woman__', tags)[0].id, 5133);
assert.equal(core.suggest('zzzznonexistentzzzz', tags).length, 0);
assert.throws(() => core.galleryUrl('bad.example', 'image', tags));
assert.throws(() => core.galleryUrl('civitai.com', 'image', []));
assert.deepEqual(core.parseTagResponse({ result: { data: { json: { items: [{ id: 7, name: 'test' }, { id: -1, name: 'invalid' }] } } } }), [{ id: 7, name: 'test' }]);
assert.throws(() => core.parseTagResponse({ error: { json: { message: 'denied' } } }), /denied/);
const ratedFixture = { id: 999999, name: 'mature fixture', nsfwLevel: 8 };
assert(core.isNsfwTag(core.mergeTags([ratedFixture], [{ id: 999999, name: 'mature fixture' }])[0]));
assert.equal(new URL(core.galleryUrl('civitai.com', 'video', [ratedFixture])).hostname, 'civitai.red');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'civitai-tags-test-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CIVITAI_TEST_BROWSER ? { executablePath: process.env.CIVITAI_TEST_BROWSER } : { channel: 'chromium' }),
    headless: true, args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`]
  });
  let liveRequests = 0;
  context.setDefaultTimeout(10000);
  try {
    await context.route(/^https:\/\/civitai\.(com|red)\//, async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/trpc/tag.getAll') {
        liveRequests++;
        const input = JSON.parse(url.searchParams.get('input')).json;
        assert.deepEqual(input.entityType, ['Image']);
        assert.deepEqual(input.include, ['nsfwLevel']);
        if (input.query === 'outage') return route.fulfill({ status: 503, body: 'Unavailable' });
        if (input.query === 'late rating') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { data: { json: { items: [{ id: 987654320, name: 'late rating', nsfwLevel: 4 }] } } } }) });
        const name = input.query === 'novel scene' ? 'novel scene' : input.query;
        const matches = input.query === 'absenttag' ? [] : [tags.find(t => t.name === name) || { id: 987654321, name }];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { data: { json: { items: matches } } } }) });
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Civitai test fixture</title><main>Tag fixture</main>' });
    });
    const manage = await context.newPage();
    await manage.goto('chrome://extensions');
    const item = manage.locator('extensions-item').filter({ hasText: 'Civitai Image & Video Tag Search' });
    await item.waitFor();
    const id = await item.getAttribute('id');
    assert(id && /^[a-p]{32}$/.test(id));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.waitForFunction(() => document.getElementById('catalog-count').textContent.length > 0);
    assert.equal((await page.locator('#catalog-count').textContent()).replace(/\D/g, ''), String(tags.length));
    await page.locator('#query').fill('woman');
    await page.getByRole('button', { name: 'woman exact', exact: true }).click();
    let url = new URL(await page.locator('#link').inputValue());
    assert.equal(url.pathname, '/images'); assert.deepEqual(url.searchParams.getAll('tags'), ['5133']);
    await page.getByText('Videos', { exact: true }).click();
    assert.equal(new URL(await page.locator('#link').inputValue()).pathname, '/videos');
    await page.locator('#host').selectOption('civitai.red');
    assert.equal(new URL(await page.locator('#link').inputValue()).hostname, 'civitai.red');
    await page.locator('#query').fill('cyberpunk');
    await page.getByRole('button', { name: 'cyberpunk exact', exact: true }).click();
    url = new URL(await page.locator('#link').inputValue());
    assert.deepEqual(url.searchParams.getAll('tags'), ['5133', '499']);
    assert.equal(url.searchParams.get('types'), 'video');
    await page.evaluate(() => {
      window.originalCreate = chrome.tabs.create;
      chrome.tabs.create = async options => { window.openedGallery = options.url; return { id: 999, url: options.url }; };
    });
    await page.locator('#open').click();
    assert.equal(await page.evaluate(() => window.openedGallery), url.href);
    await page.evaluate(() => { chrome.tabs.create = window.originalCreate; });
    await page.locator('#clear').click();
    assert(await page.locator('#open').isDisabled());
    const nsfwTag = tags.find(t => t.name === 'nude' && core.isNsfwTag(t));
    assert(nsfwTag, 'Starter collection includes a real mature-rated image tag');
    await page.locator('#host').selectOption('civitai.com');
    await page.locator('#query').fill(nsfwTag.name);
    await page.getByRole('button', { name: `${nsfwTag.name} exact`, exact: true }).click();
    assert.equal(await page.locator('#host').inputValue(), 'civitai.red');
    assert.equal(new URL(await page.locator('#link').inputValue()).hostname, 'civitai.red');
    assert.equal(new URL(await page.locator('#link').inputValue()).searchParams.get('tags'), String(nsfwTag.id));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('link').value.includes('civitai.red'));
    assert((await page.locator('#status').textContent()).includes('NSFW tags open'));
    await page.locator('#clear').click();
    await page.locator('#query').fill('women');
    await page.getByRole('button', { name: 'woman related', exact: true }).waitFor();
    assert.equal(await page.locator('#link').inputValue(), '');
    await page.locator('#query').fill('senset');
    await page.getByRole('button', { name: 'sunset similar spelling', exact: true }).waitFor();
    await page.locator('#query').fill('zzzznonexistentzzzz');
    assert.equal(await page.locator('#suggestions button').count(), 0);
    assert((await page.locator('#status').textContent()).includes('No close saved tags'));
    await page.locator('#query').fill('constructor');
    assert((await page.locator('#status').textContent()).length > 0);
    await page.locator('#query').fill('__woman__');
    await page.getByRole('button', { name: 'woman exact', exact: true }).waitFor();
    await page.locator('#host').selectOption('civitai.com');
    const site = await context.newPage(); await site.goto('https://civitai.com/images');
    await page.locator('#query').fill('novel scene');
    await page.getByRole('button', { name: 'novel scene exact', exact: true }).waitFor();
    assert((await page.locator('#status').textContent()).includes('confirmed by Civitai'));
    await page.getByRole('button', { name: 'novel scene exact', exact: true }).click();
    assert.equal(new URL(await page.locator('#link').inputValue()).searchParams.get('tags'), '987654321');
    await page.reload();
    await page.locator('.selected-tag').filter({ hasText: 'novel scene' }).waitFor();
    assert.equal(await page.locator('#query').inputValue(), 'novel scene');
    await page.locator('#query').fill('absenttag');
    await page.locator('#status').filter({ hasText: 'No exact image tag found by Civitai' }).waitFor();
    await page.locator('#query').fill('outage');
    await page.locator('#status').filter({ hasText: 'Live lookup unavailable' }).waitFor();
    assert((await page.locator('#live-note').textContent()).includes('503'));
    await page.evaluate(() => chrome.storage.local.set({
      liveTags: [{ id: 987654320, name: 'late rating' }],
      settings: { host: 'civitai.com', media: 'image', query: 'late rating', selected: [{ id: 987654320, name: 'late rating' }] }
    }));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('link').value.includes('civitai.red'));
    assert.equal(await page.locator('#host').inputValue(), 'civitai.red');
    assert((await page.locator('#status').textContent()).includes('NSFW tags open'));
    assert.deepEqual(errors, []);
    assert(liveRequests >= 3);
    await page.locator('#clear').click();
    await page.locator('#query').fill('sunset');
    await page.getByRole('button', { name: 'sunset exact', exact: true }).click();
    await page.locator('#copy').click();
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor();
    const buttonBox = await page.locator('#open').boundingBox();
    assert(buttonBox.y + buttonBox.height <= 600, 'Open action remains visible inside Chrome popup limit');
    await page.locator('body').screenshot({ path: path.join(profile, 'preview.png') });
    console.log('Passed: installed extension, restricted website permissions, icon files, inherited-key crash regression, text normalization, image/video links, combined tags, clipboard without extra permission, live lookup, late NSFW rating/link update, persistence, and outage handling.');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
