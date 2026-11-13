"""Package runtime files without profiles, tests, credentials, or developer dependencies."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
assert set(manifest['host_permissions']) == {'https://civitai.com/*', 'https://civitai.red/*'}
assert manifest['permissions'] == ['storage']
names = ['manifest.json', 'core.js', 'popup.js', 'tag-bridge.js', 'popup.html', 'popup.css', 'layout.css', 'tags.json']
names.extend(f'icons/icon{size}.png' for size in (16, 32, 48, 128))
output = root / 'dist' / f"civitai-tag-search-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(root / name, name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'manifest.json' in archive.namelist()
print(output)
