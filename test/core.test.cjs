const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const root = path.join(__dirname, '..');
const tags = JSON.parse(fs.readFileSync(path.join(root, 'tags.json'), 'utf8')).tags;

test('matches real tags and suggests related words or spelling corrections', () => {
  assert.equal(core.suggest('woman', tags)[0].id, 5133);
  assert.equal(core.suggest('sunset', tags)[0].id, 3257);
  assert.equal(core.suggest('cyberpunk', tags)[0].id, 499);
  assert(core.suggest('women', tags).some(t => t.id === 5133));
  assert(core.suggest('womna', tags).some(t => t.id === 5133));
  assert(core.suggest('futuristic', tags).some(t => t.id === 499));
  assert.equal(core.suggest('zzzznonexistentzzzz', tags).length, 0);
});

test('handles inherited object keys and surrounding underscores safely', () => {
  assert.doesNotThrow(() => core.suggest('constructor', tags));
  assert.doesNotThrow(() => core.suggest('constructor woman', tags));
  assert.equal(core.suggest('__woman__', tags)[0].id, 5133);
});

test('builds scoped, multi-tag image and video links', () => {
  const selected = [{ id: 5133, name: 'woman' }, { id: 499, name: 'cyberpunk' }];
  const image = new URL(core.galleryUrl('civitai.com', 'image', selected));
  assert.equal(image.origin, 'https://civitai.com');
  assert.equal(image.pathname, '/images');
  assert.deepEqual(image.searchParams.getAll('tags'), ['5133', '499']);
  assert.equal(image.searchParams.get('types'), 'image');
  assert.equal(new URL(core.galleryUrl('civitai.red', 'video', selected)).pathname, '/videos');
  assert.throws(() => core.galleryUrl('example.com', 'image', selected));
  assert.throws(() => core.galleryUrl('civitai.com', 'image', []));
});

test('keeps mature ratings when later metadata omits them and routes to red', () => {
  const merged = core.mergeTags([{ id: 9, name: 'fixture', nsfwLevel: 4 }], [{ id: 9, name: 'fixture' }]);
  assert(core.isNsfwTag(merged[0]));
  assert.equal(new URL(core.galleryUrl('civitai.com', 'video', merged)).hostname, 'civitai.red');
});

test('rejects malformed tag data and handles endpoint errors', () => {
  assert.deepEqual(core.parseTagResponse({ result: { data: { json: { items: [{ id: 7, name: 'test' }, { id: -1, name: 'invalid' }] } } } }), [{ id: 7, name: 'test' }]);
  assert.throws(() => core.parseTagResponse({ error: { json: { message: 'Unavailable' } } }), /Unavailable/);
});

test('manifest grants only storage and the two Civitai hosts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://civitai.com/*', 'https://civitai.red/*']);
  assert.deepEqual(manifest.content_scripts[0].matches, manifest.host_permissions);
  for (const icon of Object.values(manifest.icons)) assert(fs.existsSync(path.join(root, icon)));
});
