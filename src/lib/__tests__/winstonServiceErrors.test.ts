import { describe, expect, it } from 'vitest';
import { getWinstonChatServiceMessage, getWinstonVoiceServiceMessage } from '../winstonServiceErrors';

describe('Winston service error messages', () => {
  it('explains AI credit and Premium responses in chat', () => {
    expect(getWinstonChatServiceMessage(402)).toContain('out of credits');
    expect(getWinstonChatServiceMessage(402, 'premium_required')).toContain('available with Premium');
  });

  it('explains AI daily quota and rate-limit responses in chat', () => {
    expect(getWinstonChatServiceMessage(429, 'ai_limit_reached')).toContain('free Winston messages');
    expect(getWinstonChatServiceMessage(429)).toContain('too many requests');
  });

  it('explains voice credit and rate-limit responses', () => {
    expect(getWinstonVoiceServiceMessage(402)).toContain('ElevenLabs account');
    expect(getWinstonVoiceServiceMessage(429)).toContain('too many requests');
    expect(getWinstonVoiceServiceMessage(401)).toBeNull();
  });
});