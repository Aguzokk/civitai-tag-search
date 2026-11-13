"use strict";
const $ = id => document.getElementById(id);
let catalog = [], selected = [], timer, generation = 0;
let liveState = { query: "", status: "idle", error: "" };
const checked = new Map();
const media = () => document.querySelector('input[name="media"]:checked').value;
const host = () => $("host").value;
const query = () => TagSearch.normalize($("query").value);
function save() {
  chrome.storage.local.set({ settings: { host: host(), media: media(), selected, query: $("query").value } })
    .catch(() => { $("live-note").textContent = "Could not remember your choices. Search still works in this popup."; });
}
function updateLink() {
  selected = TagSearch.mergeTags(selected.map(tag => catalog.find(t => t.id === tag.id) || tag));
  if (selected.some(TagSearch.isNsfwTag) && host() !== "civitai.red") {
    $("host").value = "civitai.red";
    generation++;
    liveState = { query: "", status: "idle" };
  }
  const enabled = selected.length > 0;
  $("link").value = enabled ? TagSearch.galleryUrl(host(), media(), selected) : "";
  $("open").disabled = $("copy").disabled = !enabled;
  $("open").replaceChildren(document.createTextNode(`Open ${media() === "video" ? "videos" : "images"} `));
  const arrow = document.createElement("span"); arrow.textContent = "↗"; $("open").append(arrow);
  $("selected").replaceChildren();
  if (!enabled) {
    const empty = document.createElement("span"); empty.className = "empty";
    empty.textContent = "Choose a tag above to create your link."; $("selected").append(empty);
  }
  for (const tag of selected) {
    const button = document.createElement("button"); button.className = "selected-tag";
    button.textContent = tag.name; button.title = `Remove ${tag.name}`;
    button.setAttribute("aria-label", `Remove ${tag.name}`);
    const cross = document.createElement("span"); cross.textContent = "×"; button.append(cross);
    button.onclick = () => { selected = selected.filter(t => t.id !== tag.id); updateLink(); render(); save(); };
    $("selected").append(button);
  }
}
function render() {
  const q = query();
  const matches = TagSearch.suggest(q, catalog);
  const exact = matches.some(t => t.kind === "exact");
  $("catalog-count").textContent = `${catalog.length.toLocaleString()} saved tags`;
  $("results-title").textContent = !q ? "Start with a tag" : exact ? "Matching image tags" : "Similar image tags";
  let status = !q ? "Choose a tag, or type your own." : exact ? "Exact tag found. Select it to build your link." :
    matches.length ? "No exact match in saved tags. Try these alternatives." : "No close saved tags. Try a shorter or broader word.";
  if (liveState.query === q) {
    if (liveState.status === "loading") status += " Checking live tags…";
    if (liveState.status === "ok") status = liveState.exact ? "Exact image tag confirmed by Civitai." :
      liveState.limited ? "No exact tag in the first 100 live matches. Type more letters." :
      exact ? "Saved exact tag available; Civitai did not return it in this live lookup." :
      "No exact image tag found by Civitai. Try a similar tag below.";
    if (liveState.status === "error") status += " Live lookup unavailable; saved tags still work.";
  }
  if (selected.some(TagSearch.isNsfwTag)) status += " NSFW tags open on civitai.red.";
  $("status").textContent = status;
  $("suggestions").replaceChildren();
  const labels = { exact: "exact", matching: "match", related: "related", spelling: "similar spelling" };
  for (const tag of matches) {
    const button = document.createElement("button"); button.className = `tag ${tag.kind}`;
    button.textContent = tag.name; button.title = `Image tag #${tag.id}`;
    button.setAttribute("aria-label", `${tag.name} ${labels[tag.kind] || ""}`.trim());
    button.setAttribute("aria-pressed", String(selected.some(t => t.id === tag.id)));
    if (labels[tag.kind]) { const hint = document.createElement("span"); hint.className = "kind"; hint.textContent = labels[tag.kind]; button.append(hint); }
    if (TagSearch.isNsfwTag(tag)) { const badge = document.createElement("span"); badge.className = "nsfw-label"; badge.textContent = "NSFW"; button.append(badge); }
    button.onclick = () => {
      selected = selected.some(t => t.id === tag.id) ? selected.filter(t => t.id !== tag.id) : [...selected, ...TagSearch.mergeTags([tag])];
      updateLink(); render(); save();
    };
    $("suggestions").append(button);
  }
  $("live-check").disabled = !q || (liveState.query === q && liveState.status === "loading");
}
async function siteTab(create) {
  const tabs = await chrome.tabs.query({ url: `https://${host()}/*` });
  let tab = tabs.find(t => t.active) || tabs[0];
  if (!tab && !create) return null;
  if (!tab) tab = await chrome.tabs.create({ url: `https://${host()}/images`, active: false });
  if (tab.status === "complete") return tab;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Civitai is still loading. Wait, then check again.")); }, 18000);
    function listener(id, change) {
      if (id === tab.id && change.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(tab); }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tab.id).then(current => { if (current.status === "complete") listener(tab.id, { status: "complete" }); }).catch(() => {});
  });
}
async function requestTags(tabId, q) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await chrome.tabs.sendMessage(tabId, { type: "civitai-image-tags", query: q }); }
    catch (error) {
      // A new document can finish loading just before its content script registers.
      if (attempt === 4 || !/Receiving end|Could not establish connection/i.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
}
async function lookup(create = false) {
  const q = query(), version = generation, lookupHost = host();
  if (!q) return;
  const key = `${lookupHost}:${q}`;
  if (checked.has(key) && !create) { liveState = { query: q, status: "ok", ...checked.get(key) }; render(); return; }
  try {
    const tab = await siteTab(create);
    if (!tab || version !== generation) return;
    liveState = { query: q, status: "loading" }; render();
    const result = await requestTags(tab.id, q);
    if (!result?.ok) throw new Error(result?.error || "Refresh the Civitai tab, then try again.");
    catalog = TagSearch.mergeTags(catalog, result.tags || []);
    await chrome.storage.local.set({ liveTags: TagSearch.mergeTags((await chrome.storage.local.get("liveTags")).liveTags || [], result.tags || []).slice(-15000) });
    // A previously saved tag can gain a mature rating during live lookup.
    // Update the existing selection and link immediately when that happens.
    const destinationBefore = host();
    updateLink();
    save();
    if (host() !== destinationBefore) { render(); return; }
    const verdict = { exact: (result.tags || []).some(t => TagSearch.normalize(t.name) === q), limited: !!result.limited };
    checked.set(key, verdict);
    if (version !== generation) return;
    liveState = { query: q, status: "ok", ...verdict };
    $("live-note").textContent = result.limited ? "Civitai returned the first 100 tags. Add more letters to narrow them." : `Checked live image tags on ${lookupHost}.`;
  } catch (error) {
    if (version !== generation) return;
    liveState = { query: q, status: "error", error: error.message };
    $("live-note").textContent = /Receiving end|connection|Could not establish/i.test(error.message) ?
      "Refresh your Civitai tab once after installing the extension, then check again." : error.message;
  }
  render();
}
$("query").addEventListener("input", () => {
  generation++; clearTimeout(timer); liveState = { query: "", status: "idle" };
  $("live-note").textContent = "Live lookup uses an open Civitai tab. Saved tags work immediately.";
  render(); save(); timer = setTimeout(() => lookup(false), 550);
});
$("query").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const results = TagSearch.suggest(query(), catalog);
  const exact = results.find(t => t.kind === "exact");
  if (exact) {
    if (!selected.some(t => t.id === exact.id)) selected.push(...TagSearch.mergeTags([exact]));
    updateLink(); render(); save();
  } else $("suggestions").querySelector("button")?.focus();
});
$("host").onchange = () => { generation++; liveState = { query: "", status: "idle" }; updateLink(); render(); save(); lookup(false); };
for (const radio of document.querySelectorAll('input[name="media"]')) radio.onchange = () => { updateLink(); save(); };
$("clear").onclick = () => { selected = []; updateLink(); render(); save(); };
$("live-check").onclick = () => lookup(true);
$("open").onclick = () => chrome.tabs.create({ url: $("link").value })
  .catch(() => { $("status").textContent = "Could not open a tab. Use Copy link instead."; });
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText($("link").value); $("copy").textContent = "Copied!"; setTimeout(() => { $("copy").textContent = "Copy link"; }, 1500); }
  catch { $("link").focus(); $("link").select(); $("status").textContent = "Press Ctrl+C to copy the selected link."; }
};
(async () => {
  try {
    const [seed, saved] = await Promise.all([fetch("tags.json").then(r => r.json()), chrome.storage.local.get(["liveTags", "settings"])]);
    catalog = TagSearch.mergeTags(seed.tags, saved.liveTags || []);
    const settings = saved.settings || {};
    if (["civitai.com", "civitai.red"].includes(settings.host)) $("host").value = settings.host;
    if (["image", "video"].includes(settings.media)) document.querySelector(`input[name="media"][value="${settings.media}"]`).checked = true;
    selected = TagSearch.mergeTags(settings.selected || []);
    $("query").value = String(settings.query || "").slice(0, 100);
    updateLink(); render(); $("query").focus();
    if (query()) lookup(false);
  } catch { $("status").textContent = "Could not load saved tags. Reload the extension."; }
})();
