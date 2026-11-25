// Builds the public Quick Dial pages (privacy policy, terms, account deletion) from the
// markdown in this folder, for GitHub Pages (.github/workflows/quick-pages.yml).
//
// The contact email is filled in here, at publish time, from the QUICKDIAL_CONTACT_EMAIL
// repository variable, so no personal address is committed. The build stops if the email is
// missing or if any other [BRACKETED] placeholder is left in a page.
//
//   MARKED=/path/to/marked.esm.js CONTACT_EMAIL=someone@example.com node build-pages.mjs site

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { marked } = await import(pathToFileURL(process.env.MARKED ?? '').href);

const email = (process.env.CONTACT_EMAIL ?? '').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Set CONTACT_EMAIL (the QUICKDIAL_CONTACT_EMAIL repository variable) to a valid address.');
  process.exit(1);
}

const out = process.argv[2] ?? 'site';
const pages = [
  { src: 'privacy-policy.md', file: 'privacy.html', title: 'Privacy policy' },
  { src: 'terms.md', file: 'terms.html', title: 'Terms of use' },
  { src: 'delete-account.md', file: 'delete-account.html', title: 'Delete your account' },
];

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const nav = pages.map((p) => `<a href="${p.file}">${p.title}</a>`).join(' · ');

const page = (title, body) => `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Quick Dial</title>
<style>
  :root { color-scheme: light dark; --ink: #1c1a24; --muted: #5d5a6b; --line: #dedbe8; --accent: #7b3fe4; }
  @media (prefers-color-scheme: dark) { :root { --ink: #eceaf3; --muted: #a9a5ba; --line: #34313f; --accent: #b79bff; } }
  body { margin: 0; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); }
  main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 1rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 0.5rem; }
  a { color: var(--accent); }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; margin: 1rem 0; }
  th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; }
  footer { max-width: 44rem; margin: 0 auto; padding: 1rem 1.25rem 2.5rem; color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--line); }
  @media (max-width: 560px) { table { display: block; overflow-x: auto; } }
</style>
</head>
<body>
<main>
${body}
</main>
<footer>Quick Dial · ${nav}</footer>
</body>
</html>
`;

mkdirSync(`${out}/quick-dial`, { recursive: true });

for (const p of pages) {
  const md = readFileSync(new URL(p.src, import.meta.url), 'utf8')
    .replaceAll('[CONTACT EMAIL]', `[${email}](mailto:${email})`);
  const left = md.match(/\[[A-Z][A-Z ,'/-]{3,}\]/g);
  if (left) {
    console.error(`${p.src} still has placeholders: ${[...new Set(left)].join(', ')}`);
    process.exit(1);
  }
  writeFileSync(`${out}/quick-dial/${p.file}`, page(p.title, marked.parse(md)));
  console.log(`quick-dial/${p.file}`);
}

const links = pages.map((p) => `<li><a href="${p.file}">${p.title}</a></li>`).join('\n');
writeFileSync(`${out}/quick-dial/index.html`, page('Quick Dial', `<h1>Quick Dial</h1>\n<ul>\n${links}\n</ul>`));
writeFileSync(`${out}/index.html`, '<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=quick-dial/"><title>Quick Dial</title><a href="quick-dial/">Quick Dial</a>\n');
