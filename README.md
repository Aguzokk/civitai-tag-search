<p><img src="icons/icon128.png" width="80" height="80" alt="Red search icon"></p>

# Civitai Image & Video Tag Search

Find real image tags, get spelling and related-tag suggestions, and open filtered Civitai image or video galleries.

**[Download the extension ZIP](https://github.com/Aguzokk/civitai-tag-search/raw/refs/heads/main/downloads/civitai-tag-search-1.2.0.zip)** · [Privacy](PRIVACY.md) · [Report an issue](https://github.com/Aguzokk/civitai-tag-search/issues)

![Actual extension interface](docs/screenshot.png)

## Install in Chrome or Edge

1. Download the extension ZIP using the link above and extract it to a folder you want to keep.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Pin **Civitai Image & Video Tag Search** from the extensions menu.
6. Refresh any Civitai tabs that were open during installation.

This repository distributes a locally installed extension. No Chrome Web Store developer account or payment is needed to use it. Firefox has not been ported or tested.

You can also use GitHub's **Code → Download ZIP**, extract it, and load the repository's top-level folder containing `manifest.json`.

## Use it

1. Open the extension and type a subject such as **woman**, **sunset**, or **cyberpunk**.
2. Select an exact tag or one of the alternatives. **Enter** selects an exact match.
3. Choose **Images** or **Videos**, and the desired Civitai website.
4. Use **Open images/videos** or **Copy link**.

Select several tags to narrow a gallery. Scroll the search panel to see **Selected tags**, remove individual tags, or use **Clear**. The generated link and its buttons stay visible.

The starter collection contains **2,476 real image tags**, including rated mature tags. Suggestions include exact names, prefixes, words within longer tags, similar spellings, and a small related-word dictionary. For example, **women → woman**, **sundown → sunset**, and **futuristic → cyberpunk**. Suggestions never invent numeric tag IDs or silently substitute another tag.

## Live tag lookup

With a tab open on the chosen Civitai website, typing checks live image tags after a short pause. **Check live image tags** opens a Civitai tab if one is needed. Learned tags are saved locally.

If the tab is still loading, the extension waits for it. If lookup fails, saved tags and links remain usable. A missing saved match is not presented as proof that the tag does not exist on Civitai.

The live endpoint returns up to 100 tags beginning with your search text. Type more letters if the limit is reached. Related-word and typo suggestions use the saved collection.

## Mature tags and limitations

Rated mature tags show an **NSFW** label and route gallery links to **civitai.red**. Both images and videos are supported. Unrated tags cannot reliably be classified, so you may select civitai.red yourself.

Civitai's account restrictions, regional availability, and content settings still apply. The extension does not change or bypass them. No images or videos are bundled or downloaded by the extension.

Search is based on assigned image tags, rather than arbitrary prompt text. An image missing a requested tag may be missed. A tag may exist without public results in the chosen media type. Multiple-tag behavior follows Civitai's gallery implementation and may vary during server rollouts.

Live lookup uses Civitai's internal `tag.getAll` endpoint with `entityType: ["Image"]`; changes to Civitai can affect it. Cached names and IDs may become stale. See [the public image API documentation](https://github.com/civitai/civitai-developer-docs/blob/main/site/reference/images.md) and [gallery URL schema](https://github.com/civitai/civitai/blob/main/src/components/Image/image-query-params.ts).

## Permissions and privacy

- `storage`: remembers searches, selected tags, media/website choices, and learned tags locally.
- `https://civitai.com/*` and `https://civitai.red/*`: locate a Civitai tab and perform read-only image-tag lookup.
- No other website access, clipboard permission, analytics, advertising, developer server, or remote executable code.

Live lookup sends typed search words only to the selected Civitai site. Its normal session handling applies; the extension does not read or copy account cookies or passwords. Gallery links include numeric tag IDs. See [the full privacy policy](PRIVACY.md).

## Development and verification

The extension runs directly from these files; no JavaScript build step is required.

For core checks, use Node.js 18 or newer:

```sh
npm test
```

For the browser integration checks:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The browser checks use a separate temporary profile and mocked Civitai responses. They cover installation, scoped permissions, matching and spelling suggestions, multi-tag/media/domain links, copy behavior, persistence, live-service failures, and a newly learned mature rating changing an existing link. Set `CIVITAI_TEST_BROWSER` only if you want to use your own Chromium executable.

Create an extension ZIP with Python 3:

```sh
python scripts/package.py
```

The script includes only runtime files and PNG icons, with `manifest.json` at the ZIP root. The committed `downloads` ZIP is the tested v1.2.0 build; building writes a new ZIP under `dist`.

Version 1.2.0 was also checked against live Civitai tag metadata, including mature ratings and image/video link generation. A fresh test browser encountered Civitai's Cloudflare check when opening a gallery, so end-to-end gallery rendering was not verified in that profile.

## Credits

Repository owner: **Aguzokk**. Development assistance: **OpenAI Codex**.

This independent project is not affiliated with or endorsed by Civitai, Google, or Mozilla.
