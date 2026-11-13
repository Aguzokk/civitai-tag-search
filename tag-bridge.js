/* Only performs read-only image-tag lookup on the Civitai page itself. */
(() => {
  "use strict";
  const cache = new Map();
  const safeRespond = (respond, value) => {
    // The popup may have closed, or the extension may have been reloaded during a request.
    try { respond(value); } catch { /* No receiver remains. */ }
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    try {
      if (!chrome.runtime?.id || sender.id !== chrome.runtime.id || message?.type !== "civitai-image-tags") return;
    } catch { return; }
    if (!["civitai.com", "civitai.red"].includes(location.hostname)) return;
    const query = typeof message.query === "string" ? message.query.trim().toLowerCase() : "";
    if (!query || query.length > 100) { safeRespond(respond, { ok: false, error: "Enter 1–100 characters." }); return; }
    if (cache.has(query)) { safeRespond(respond, cache.get(query)); return; }
    (async () => {
      // No rating filter: include all image tags the site makes available to this viewer.
      const input = { json: { query, entityType: ["Image"], include: ["nsfwLevel"], limit: 100, page: 1 } };
      const url = new URL("/api/trpc/tag.getAll", location.origin);
      url.searchParams.set("input", JSON.stringify(input));
      const response = await fetch(url.href, {
        credentials: "same-origin", signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`Civitai tag lookup returned HTTP ${response.status}.`);
      const payload = await response.json();
      const error = payload?.error?.json?.message || payload?.error?.message;
      if (error) throw new Error(error);
      const body = payload.result?.data?.json ?? payload.result?.data;
      if (!body || !Array.isArray(body.items)) throw new Error("Civitai changed its tag response.");
      const tags = body.items.filter(t => Number.isSafeInteger(t.id) && t.id > 0 &&
        typeof t.name === "string" && t.name.length <= 200).map(t => ({ id: t.id, name: t.name,
          ...(Number.isSafeInteger(t.nsfwLevel) && t.nsfwLevel >= 0 && t.nsfwLevel <= 31 ? { nsfwLevel: t.nsfwLevel } : {}) }));
      const result = { ok: true, tags, limited: tags.length >= 100, host: location.hostname };
      cache.set(query, result);
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      return result;
    })().then(result => safeRespond(respond, result))
      .catch(error => safeRespond(respond, { ok: false, error: error.message }));
    return true;
  });
})();
