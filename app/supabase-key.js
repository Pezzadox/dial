// The Supabase key ships inside the app, so it has to be the public one, and it has to look like a
// Supabase key at all. Release 1.0.1 of Quick Dial went out with a value that was neither, and every
// sign-in failed with "Invalid API key". Returns what is wrong, or null when the key looks right.
// Never echoes the key itself.
function publicKeyProblem(raw) {
  const key = (raw || '').trim();
  if (!key) return 'is empty.';
  if (key !== raw) return 'has spaces or a line break around it. Paste it again without them.';
  if (key.startsWith('sb_secret_')) return 'is a secret key. Use the publishable key (sb_publishable_…) from Supabase → Project settings → API keys.';
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) return null;
  const parts = key.split('.');
  if (parts.length === 3 && key.startsWith('eyJ')) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (claims.role === 'service_role') return 'is the service_role key. Use the publishable key (sb_publishable_…) instead.';
      if (claims.role === 'anon') return null;
    } catch {
      // fall through
    }
  }
  return 'is not a Supabase key. Copy the publishable key (sb_publishable_…) from Supabase → Project settings → API keys.';
}

module.exports = { publicKeyProblem };
