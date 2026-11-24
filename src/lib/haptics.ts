// Haptic feedback using the Vibration API (mobile only).
// Respects the user's haptics-enabled preference from Sound Settings.

import { isHapticsEnabled } from "@/lib/sfx";

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && !!navigator.vibrate && isHapticsEnabled();
}

export function vibrateLight() {
  if (canVibrate()) navigator.vibrate(10);
}

export function vibrateMedium() {
  if (canVibrate()) navigator.vibrate(25);
}

export function vibrateSuccess() {
  if (canVibrate()) navigator.vibrate([15, 50, 15]);
}

export function vibrateHeavy() {
  if (canVibrate()) navigator.vibrate([30, 50, 30, 50, 30]);
}
