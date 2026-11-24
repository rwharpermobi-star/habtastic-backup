import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Diary from '@/pages/Diary';
import { diaryStorageKey } from '@/lib/diaryStorage';

const mocks = vi.hoisted(() => ({
  user: { id: 'owner-a' } as { id: string } | null,
  unlocked: true, pinValid: true, native: true, snapshot: null,
  uploadError: null as string | null, readError: null as string | null,
  deleteError: null as string | null, httpError: 0,
  beforeRead: null as (() => Promise<void>) | null,
  preferences: new Map<string, string>(), from: vi.fn(), rpc: vi.fn(), oauth: vi.fn(), uploads: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/JournalPasscodeGate', () => ({
  JournalPasscodeGate: ({ children }: { children: React.ReactNode }) => mocks.unlocked ? children : <p>Journal Locked</p>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => mocks.from(...a), rpc: (...a: unknown[]) => mocks.rpc(...a) },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { signInWithGoogle: (...a: unknown[]) => mocks.oauth(...a) },
}));
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: mocks.preferences.get(key) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => { mocks.preferences.set(key, value); },
  remove: async ({ key }: { key: string }) => { mocks.preferences.delete(key); },
} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/haptics', () => ({ vibrateLight: vi.fn(), vibrateSuccess: vi.fn() }));

const entry = (id = 'entry-a', title = 'A private day') => ({
  id, title, content: 'Private text', entryAt: '2026-10-01T10:00',
  createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
});
function stored(user = 'owner-a', overrides: Record<string, unknown> = {}) {
  localStorage.setItem(diaryStorageKey(user), JSON.stringify({
    entries: [], pending: [], deleted: [], knownCloudIds: [], tombstones: {},
    cloudSync: false, importedLegacy: false, ...overrides,
  }));
}
function saved(user = 'owner-a') { return JSON.parse(localStorage.getItem(diaryStorageKey(user))!); }
function snapshot(entries: any[] = [entry()], deleted: Record<string, string> = {}) {
  return { version: 1, updatedAt: '2026-10-02T00:00:00.000Z', entries, deleted };
}
function cacheToken(user = 'owner-a') {
  mocks.preferences.set('habtastic_google_drive_access_token_v1:' + user, 'drive-token');
  mocks.preferences.set('habtastic_google_drive_access_token_time_v1:' + user, String(Date.now()));
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('Diary Google Drive sync and private device storage', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); mocks.preferences.clear(); cacheToken();
    mocks.user = { id: 'owner-a' }; mocks.unlocked = true; mocks.pinValid = true; mocks.native = true;
    mocks.snapshot = null; mocks.uploadError = null; mocks.deleteError = null; mocks.readError = null;
    mocks.httpError = 0; mocks.beforeRead = null;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.rpc.mockImplementation(async () => ({ data: mocks.pinValid, error: null }));
    mocks.from.mockImplementation(() => { throw new Error('My Diary must not use the Supabase diary table'); });
    mocks.oauth.mockResolvedValue({ credential: { accessToken: 'connected-token' } });
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      if (mocks.httpError) return response({ error: { message: mocks.httpError === 403 ? 'Google Drive API has not been used or is disabled' : 'Expired access token' } }, mocks.httpError);
      if (init.method === 'PATCH' || init.method === 'POST') {
        const body = String(init.body);
        const data = init.method === 'PATCH' ? JSON.parse(body)
          : JSON.parse(body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[2].split('\r\n--')[0]);
        if (mocks.uploadError || (mocks.deleteError && Object.keys(data.deleted).length)) {
          return response({ error: { message: mocks.uploadError ?? mocks.deleteError } }, 500);
        }
        mocks.uploads(data); mocks.snapshot = data;
        return response({ id: 'drive-file' });
      }
      if (url.searchParams.get('alt') === 'media') {
        if (mocks.beforeRead) await mocks.beforeRead();
        if (mocks.readError) return response({ error: { message: mocks.readError } }, 500);
        return response(mocks.snapshot);
      }
      if (mocks.readError) return response({ error: { message: mocks.readError } }, 500);
      expect(url.hostname).toBe('www.googleapis.com');
      expect(url.searchParams.get('spaces')).toBe('appDataFolder');
      expect(url.searchParams.get('q')).toContain('habtastic-diary-v2-' + mocks.user?.id + '.json');
      return response({ files: mocks.snapshot ? [{ id: 'drive-file' }] : [] });
    }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('does not read device entries or query Drive before the PIN gate opens', () => {
    mocks.unlocked = false;
    const read = vi.spyOn(Storage.prototype, 'getItem');
    render(<Diary />);
    expect(screen.getByText('Journal Locked')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('connects with the narrow app-data scope and uploads existing device entries to the user-owned Drive', async () => {
    mocks.preferences.clear(); stored('owner-a', { entries: [entry()] });
    render(<Diary />);
    fireEvent.click(screen.getByRole('switch', { name: 'Google Drive sync' }));
    await screen.findByText('Synced to your Google Drive');
    expect(mocks.oauth).toHaveBeenCalledWith({ useCredentialManager: false, skipNativeAuth: true, scopes: ['https://www.googleapis.com/auth/drive.appdata'] });
    expect(mocks.snapshot.entries[0].title).toBe('A private day');
    expect(saved().pending).toEqual([]); expect(mocks.from).not.toHaveBeenCalled();
    const creation = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(creation?.[1]?.body).toContain('"parents":["appDataFolder"]');
  });

  it('explains access-check network failures and preserves the local diary', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()], pending: ['entry-a'] });
    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<Diary />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not reach HabTastic to verify diary access');
    expect(saved().entries[0].content).toBe('Private text');
    expect(saved().pending).toEqual(['entry-a']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a failed upload queued for an online retry instead of claiming success', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()], pending: ['entry-a'] });
    mocks.uploadError = 'Network unavailable';
    render(<Diary />);
    await screen.findByText('Sync failed — device copy kept');
    expect(screen.queryByText('Synced to your Google Drive')).not.toBeInTheDocument();
    expect(saved().entries[0].content).toBe('Private text'); expect(saved().pending).toEqual(['entry-a']);
    mocks.uploadError = null; fireEvent(window, new Event('online'));
    await screen.findByText('Synced to your Google Drive'); expect(saved().pending).toEqual([]);
  });

  it('keeps the local diary after a failed Drive read', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()], knownCloudIds: ['entry-a'] });
    mocks.readError = 'Server unavailable'; render(<Diary />);
    await screen.findByText('Sync failed — device copy kept');
    expect(screen.getByText('A private day')).toBeInTheDocument(); expect(saved().entries).toHaveLength(1);
  });

  it('retries failed deletes and retains deletion tombstones after success', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] }); mocks.snapshot = snapshot();
    render(<Diary />); await screen.findByText('Synced to your Google Drive');
    mocks.deleteError = 'Offline'; fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    await screen.findByText('Sync failed — device copy kept');
    expect(saved().deleted).toEqual(['entry-a']); expect(saved().entries).toEqual([]);
    mocks.deleteError = null; fireEvent.click(screen.getByRole('button', { name: 'Refresh sync' }));
    await screen.findByText('Synced to your Google Drive');
    expect(saved().deleted).toEqual([]); expect(mocks.snapshot.entries).toEqual([]);
    expect(mocks.snapshot.deleted['entry-a']).toBeTruthy(); expect(saved().tombstones['entry-a']).toBeTruthy();
  });

  it('does not resurrect an entry deleted on another device', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] });
    mocks.snapshot = snapshot([], { 'entry-a': '2026-10-02T10:00:00.000Z' });
    render(<Diary />); await screen.findByText('Synced to your Google Drive');
    expect(saved().entries).toEqual([]); expect(mocks.snapshot.entries).toEqual([]);
  });

  it('separates device entries when the signed-in account changes', () => {
    stored('owner-a', { entries: [entry()] }); stored('owner-b', { entries: [entry('entry-b', 'B private day')] });
    const view = render(<Diary />); expect(screen.getByText('A private day')).toBeInTheDocument();
    mocks.user = { id: 'owner-b' }; view.rerender(<Diary />);
    expect(screen.queryByText('A private day')).not.toBeInTheDocument(); expect(screen.getByText('B private day')).toBeInTheDocument();
  });

  it('never reuses another HabTastic account’s cached Drive access', async () => {
    mocks.user = { id: 'owner-b' }; stored('owner-b', { cloudSync: true });
    render(<Diary />); await screen.findByText('Sync failed — device copy kept');
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.oauth).not.toHaveBeenCalled();
    expect(mocks.preferences.get('habtastic_google_drive_access_token_v1:owner-a')).toBe('drive-token');
  });

  it('keeps unowned legacy entries separate until the user deliberately imports them', () => {
    localStorage.setItem('habtastic_diary_entries_v1', JSON.stringify([entry()]));
    render(<Diary />);
    expect(screen.queryByText('A private day')).not.toBeInTheDocument(); expect(mocks.uploads).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import previous device entries' }));
    expect(screen.getByText('A private day')).toBeInTheDocument(); expect(saved().entries[0].id).not.toBe('entry-a');
    expect(localStorage.getItem('habtastic_diary_entries_v1')).toContain('Private text');
  });

  it('does not replace a corrupted device store with an empty diary', () => {
    localStorage.setItem(diaryStorageKey('owner-a'), '{broken'); render(<Diary />);
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /^New$/ })).toBeDisabled();
    expect(localStorage.getItem(diaryStorageKey('owner-a'))).toBe('{broken');
  });

  it('relocks before contacting Drive when the PIN session has expired', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()], pending: ['entry-a'] });
    mocks.pinValid = false; mocks.rpc.mockImplementation(async () => { mocks.unlocked = false; return { data: false, error: null }; });
    render(<Diary />); await screen.findByText('Journal Locked');
    expect(fetch).not.toHaveBeenCalled(); expect(saved().pending).toEqual(['entry-a']);
  });

  it('retains an edit made while a Drive read is in flight', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] }); mocks.snapshot = snapshot();
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
    mocks.beforeRead = () => waiting; render(<Diary />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('alt=media'))).toBe(true));
    fireEvent.click(screen.getByText('A private day'));
    fireEvent.change(screen.getByPlaceholderText('Title (optional)'), { target: { value: 'Edited during sync' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' })); release();
    await screen.findByText('Synced to your Google Drive');
    expect(saved().entries[0].title).toBe('Edited during sync'); expect(mocks.snapshot.entries[0].title).toBe('Edited during sync');
  });

  it('rejects malformed Drive backups without overwriting either copy', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] });
    mocks.snapshot = snapshot([{ id: 'broken', content: 123 }]); render(<Diary />);
    await screen.findByText('Sync failed — device copy kept');
    expect(saved().entries[0].content).toBe('Private text'); expect(mocks.uploads).not.toHaveBeenCalled();
  });

  it('clears expired access and reconnects only after a user action', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] }); mocks.httpError = 401;
    render(<Diary />); await screen.findByText('Sync failed — device copy kept');
    expect(mocks.preferences.has('habtastic_google_drive_access_token_v1:owner-a')).toBe(false);
    expect(mocks.oauth).not.toHaveBeenCalled();
    mocks.httpError = 0; fireEvent.click(screen.getByRole('button', { name: 'Refresh sync' }));
    await screen.findByText('Synced to your Google Drive'); expect(mocks.oauth).toHaveBeenCalledTimes(1);
  });

  it('reports unfinished Google API setup while retaining the local copy', async () => {
    stored('owner-a', { cloudSync: true, entries: [entry()] }); mocks.httpError = 403;
    render(<Diary />); await screen.findByText('Sync failed — device copy kept');
    expect(screen.getByRole('alert')).toHaveTextContent('Google Drive API is not enabled');
    expect(saved().entries[0].content).toBe('Private text');
  });

  it('offers a Drive link and keeps native-only sync disabled on the website', () => {
    mocks.native = false; render(<Diary />);
    expect(screen.getByRole('switch', { name: 'Google Drive sync' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Open Google Drive' })).toHaveAttribute('href', 'https://drive.google.com');
  });
});
