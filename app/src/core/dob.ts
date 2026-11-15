// Date of birth typed as DD/MM/YYYY. The slashes are put in for you, so you only ever type digits.

/** Digits in, "DD/MM/YYYY" out, as far as you've typed. Slashes appear as soon as the next part starts. */
export function formatDob(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** What's left of the DD/MM/YYYY mask after what you've typed, shown faintly ahead of the cursor. */
export function dobMaskRest(formatted: string): string {
  return 'DD/MM/YYYY'.slice(formatted.length);
}

/** A complete, real date ("31/02/1990" isn't) as YYYY-MM-DD, or null. */
export function dobToIso(formatted: string): string | null {
  const m = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || date.getTime() > Date.now()) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ageOn(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}
