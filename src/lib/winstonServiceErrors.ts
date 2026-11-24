export function getWinstonChatServiceMessage(status: number, code?: string): string | null {
  if (status === 401) {
    return 'Your sign-in has expired, so Winston could not answer. Please sign out and sign in again.';
  }
  if (status === 402) {
    return code === 'premium_required'
      ? 'This Winston coaching action is available with Premium.'
      : "Winston's AI service is out of credits right now. Please try again later.";
  }
  if (status === 429) {
    return code === 'ai_limit_reached'
      ? "You've used all your free Winston messages for today. Upgrade to Premium for unlimited coaching."
      : "Winston's AI is handling too many requests. Please wait a moment and try again.";
  }
  return null;
}

export function getWinstonVoiceServiceMessage(status: number): string | null {
  // 401 comes from our own sign-in check, not from ElevenLabs; callers handle it.
  // elevenlabs-tts reports an ElevenLabs key/permission problem as 502.
  if (status === 403 || status === 502) {
    return "Winston couldn't connect to the voice provider. The voice configuration may need attention.";
  }
  if (status === 402) {
    return "Winston's voice service is out of credits. The ElevenLabs account may need a top-up.";
  }
  if (status === 429) {
    return "Winston's voice service is handling too many requests. Please wait a moment and try again.";
  }
  if (status === 503) {
    return "Winston's voice service isn't configured right now. Please try again later.";
  }
  return null;
}