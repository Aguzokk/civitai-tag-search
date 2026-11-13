(function (root) {
  "use strict";
  const related = {
    women: ["woman"], female: ["woman", "female focus"], girl: ["woman", "1girl"],
    sunset: ["dusk", "sky", "sun", "sunlight", "landscape"],
    sunrise: ["sunset", "sun", "sky", "sunlight"],
    sundown: ["sunset", "dusk"], evening: ["sunset", "dusk", "night"],
    cyberpunk: ["neon", "science fiction", "city", "cyborg", "futuristic"],
    futuristic: ["cyberpunk", "science fiction", "robot", "city"],
    scifi: ["science fiction", "cyberpunk", "spaceship", "robot"],
    "sci fi": ["science fiction", "cyberpunk", "spaceship", "robot"],
    cozy: ["indoors", "bedroom", "sweater", "fireplace", "warm lighting"],
    cosy: ["indoors", "bedroom", "sweater", "fireplace", "warm lighting"],
    beach: ["ocean", "sea", "sand", "shore", "sunset"],
    seaside: ["beach", "ocean", "sea", "shore"],
    woods: ["forest", "tree", "nature"], woodland: ["forest", "tree", "nature"],
    urban: ["city", "street", "cityscape", "architecture"],
    pretty: ["portrait", "woman", "flower"],
    photorealistic: ["realistic", "photography", "portrait"],
    photo: ["photography", "realistic", "portrait"],
    cartoon: ["anime", "animated", "comics", "drawing"],
    medieval: ["fantasy", "castle", "knight", "armor"],
    stars: ["star (sky)", "starry sky", "night sky"],
    space: ["outer space", "galaxy", "nebula", "planet", "spaceship"],
    rain: ["rain", "rainy", "wet", "umbrella"],
    snowy: ["snow", "snowing", "winter"],
    mountain: ["mountain", "landscape", "nature"],
    garden: ["flower", "plant", "grass", "nature"],
    happy: ["smile", "laughing", "grin"], sad: ["crying", "tears", "sad"],
    redhead: ["red hair"], blonde: ["blonde hair"], brunette: ["brown hair"],
    nsfw: ["nude", "lingerie", "boudoir"], naked: ["nude"], nudity: ["nude"]
  };
  const normalize = value => String(value || "").toLowerCase().trim()
    .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const getRelated = word => Object.hasOwn(related, word) ? related[word] : [];

  function validTag(value) {
    return value && Number.isSafeInteger(value.id) && value.id > 0 &&
      typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 200;
  }
  function mergeTags(...lists) {
    const map = new Map();
    for (const tag of lists.flat()) if (validTag(tag)) {
      const rating = Number.isSafeInteger(tag.nsfwLevel) && tag.nsfwLevel >= 0 && tag.nsfwLevel <= 31
        ? { nsfwLevel: tag.nsfwLevel } : {};
      map.set(tag.id, { ...map.get(tag.id), id: tag.id, name: tag.name.trim(), ...rating });
    }
    return [...map.values()];
  }
  const isNsfwTag = tag => Number.isSafeInteger(tag?.nsfwLevel) && (tag.nsfwLevel & 28) !== 0;
  function distance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let beforePrevious;
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      }
      beforePrevious = previous;
      previous = row;
    }
    return previous[b.length];
  }
  function suggest(query, tags, limit = 12) {
    const q = normalize(query);
    if (!q) {
      const popular = ["woman", "sunset", "cyberpunk", "portrait", "landscape", "forest", "anime", "beach"];
      return popular.map(name => tags.find(t => normalize(t.name) === name))
        .filter(Boolean).map(tag => ({ ...tag, kind: "popular" }));
    }
    const words = q.split(" ");
    const aliases = new Set(getRelated(q));
    // Multiword input can suggest several actual tags without inventing a combined tag.
    for (const word of words) for (const name of getRelated(word)) aliases.add(name);
    return tags.flatMap(tag => {
      const n = normalize(tag.name);
      let score = 0, kind = "similar";
      if (n === q) { score = 1000; kind = "exact"; }
      else if (n.startsWith(q)) { score = 800 - Math.min(n.length - q.length, 80); kind = "matching"; }
      else if (n.split(" ").includes(q)) { score = 730; kind = "matching"; }
      else if (n.includes(q)) { score = 680; kind = "matching"; }
      else if (aliases.has(n)) { score = 650; kind = "related"; }
      else if (words.length > 1 && words.every(w => n.includes(w))) score = 620;
      else if (words.length > 1 && words.includes(n)) score = 600;
      else if (q.length >= 3 && Math.abs(q.length - n.length) <= 2 && q.length < 50) {
        const d = distance(q, n);
        if (d <= (q.length > 5 ? 2 : 1)) { score = 560 - d * 30; kind = "spelling"; }
      }
      return score ? [{ ...tag, score, kind }] : [];
    }).sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
  function galleryUrl(host, media, tags) {
    if (!["civitai.com", "civitai.red"].includes(host)) throw new Error("Choose a Civitai website.");
    if (!["image", "video"].includes(media)) throw new Error("Choose images or videos.");
    const ids = [...new Set(tags.filter(validTag).map(t => t.id))];
    if (!ids.length) throw new Error("Select at least one real tag.");
    const destination = tags.some(isNsfwTag) ? "civitai.red" : host;
    const url = new URL(`https://${destination}/${media === "video" ? "videos" : "images"}`);
    url.searchParams.set("view", "feed");
    for (const id of ids) url.searchParams.append("tags", String(id));
    url.searchParams.set("types", media);
    return url.href;
  }
  function parseTagResponse(payload) {
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (item?.error) throw new Error(item.error.json?.message || item.error.message || "Tag lookup failed.");
    const data = item?.result?.data;
    const body = data?.json ?? data;
    if (!body || !Array.isArray(body.items)) throw new Error("Civitai returned an unfamiliar tag response.");
    return mergeTags(body.items);
  }
  const api = { normalize, validTag, mergeTags, isNsfwTag, suggest, galleryUrl, parseTagResponse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TagSearch = api;
})(globalThis);
