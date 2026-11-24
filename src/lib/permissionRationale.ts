/**
 * Just-in-time explanations shown before Android/browser permission prompts.
 * Code asks `explainPermission(kind)`; <PermissionRationaleHost/> renders the
 * dialog and resolves true (Continue) or false (Not now).
 */
export type RationaleKind = 'microphone';

export const RATIONALE_COPY: Record<RationaleKind, { title: string; body: string; confirm: string }> = {
  microphone: {
    title: 'Talk to Winston?',
    body: "HabTastic needs your microphone so you can speak to Winston instead of typing. Your phone's speech service turns your voice into text; we don't keep recordings. You can always type instead.",
    confirm: 'Continue',
  },
};

type Request = { kind: RationaleKind; resolve: (ok: boolean) => void };
type Listener = (req: Request | null) => void;

let current: Request | null = null;
const listeners = new Set<Listener>();

export function subscribeRationale(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => { listeners.delete(fn); };
}

function emit() { listeners.forEach((l) => l(current)); }

export function explainPermission(kind: RationaleKind): Promise<boolean> {
  // No host mounted (e.g. tests): don't block the feature.
  if (listeners.size === 0) return Promise.resolve(true);
  current?.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { kind, resolve };
    emit();
  });
}

export function answerRationale(ok: boolean): void {
  const req = current;
  current = null;
  emit();
  req?.resolve(ok);
}
