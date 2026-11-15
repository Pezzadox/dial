// Turns the Expo web export (dist/) into one self-contained HTML file for sharing a preview.
// Usage: npm run export:web && node scripts/build-preview.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'dist/_expo/static/js/web/';
// The entry bundle is the one dist/index.html loads. Other chunks are lazy (e.g. the camera's barcode
// scanner) and are never loaded by these apps, so the single-file preview leaves them out.
const entry = readFileSync('dist/index.html', 'utf8').match(/_expo\/static\/js\/web\/([^"']+\.js)/)?.[1];
if (!entry) throw new Error('Could not find the entry bundle in dist/index.html');
let js = readFileSync(dir + entry, 'utf8');
// Inline fonts and other assets as data URIs, so the preview is one self-contained file.
const types = { ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', jpg: 'image/jpeg', wav: 'audio/wav' };
const walk = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
for (const file of walk('dist/assets')) {
  const url = '/' + file.slice('dist/'.length);
  const type = types[file.split('.').pop()] ?? 'application/octet-stream';
  js = js.split('"' + url + '"').join('"data:' + type + ';base64,' + readFileSync(file).toString('base64') + '"');
}
js = js.replace(/<\/script/gi, '<\\/script');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${process.env.PREVIEW_TITLE ?? 'Dial app preview'}</title>
<style>html,body{height:100%;margin:0;background:#08070F}body{overflow:hidden}#root{display:flex;height:100%;flex:1}</style>
</head>
<body>
<noscript>This preview needs JavaScript.</noscript>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
const out = process.env.PREVIEW_DIR ?? 'preview';
mkdirSync(out, { recursive: true });
writeFileSync(out + '/index.html', html);
console.log(out + '/index.html', Math.round(html.length / 1024) + ' KB');
