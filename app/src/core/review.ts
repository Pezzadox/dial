// Store reviewers (Google Play, App Store) can't receive the emailed sign-in code, so one review
// account signs in with a password instead. Only this exact address gets a password field;
// everyone else signs in with a code as usual.
//
// The account is created by hand in Supabase (Authentication → Users → Add user, auto-confirmed).
// Its password lives only there and in the store consoles' reviewer notes, never in this repo.

export const REVIEW_EMAIL = 'review@pezzadox.com';

/** True only for the store-review account, however it is typed. */
export function isReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === REVIEW_EMAIL;
}
