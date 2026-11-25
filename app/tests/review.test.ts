import { describe, expect, it } from 'vitest';
import { REVIEW_EMAIL, isReviewEmail } from '../src/core/review';

describe('store-review sign-in', () => {
  it('recognises only the review account, however it is typed', () => {
    expect(isReviewEmail(REVIEW_EMAIL)).toBe(true);
    expect(isReviewEmail('  Review@Pezzadox.com ')).toBe(true);
  });
  it('leaves everyone else on emailed codes', () => {
    expect(isReviewEmail('someone@example.com')).toBe(false);
    expect(isReviewEmail('review@pezzadox.co')).toBe(false);
    expect(isReviewEmail('review@pezzadox.com.evil.test')).toBe(false);
    expect(isReviewEmail('')).toBe(false);
  });
});
