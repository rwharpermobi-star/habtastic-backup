import { describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, SUPPORT_EMAIL } from '../contactEmails';

describe('official HabTastic contact addresses', () => {
  it('admin and billing mail goes to info@habtastic.com', () => {
    expect(ADMIN_EMAIL).toBe('info@habtastic.com');
  });

  it('customer support mail goes to support@habtastic.com', () => {
    expect(SUPPORT_EMAIL).toBe('support@habtastic.com');
  });
});
