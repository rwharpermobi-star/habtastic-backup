/**
 * AutoTranslateProvider — Runtime DOM auto-translation.
 *
 * When the i18n language changes, this walks the DOM, collects every visible
 * English text node, sends them in batches to the `translate-batch` edge
 * function, and swaps the text in place. Results are cached in localStorage
 * so subsequent switches are instant.
 *
 * It also uses a MutationObserver to translate any newly-rendered nodes
 * (route changes, dialogs, toasts, lazy lists) without flicker.
 *
 * The system is intentionally conservative:
 * - Skips <script>, <style>, <code>, <pre>, <textarea>, <input>
 * - Skips elements marked with `data-no-translate` or `translate="no"`
 * - Skips text that is just numbers / symbols / single chars
 * - Skips text that already matches the cached translation (idempotent)
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabase } from '@/integrations/supabase/lazyClient';

const TRANSLATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-batch`;
const CACHE_PREFIX = 'habtastic-tr:'; // habtastic-tr:<lang> → { [original]: translation }
const ATTR_ORIGINAL = 'data-tr-original';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'SVG', 'PATH']);

type Cache = Record<string, string>;

interface Ctx {
  isTranslating: boolean;
  language: string;
}
const AutoTranslateCtx = createContext<Ctx>({ isTranslating: false, language: 'en' });
export const useAutoTranslate = () => useContext(AutoTranslateCtx);

function loadCache(lang: string): Cache {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + lang);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}
function saveCache(lang: string, cache: Cache) {
  try {
    localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(cache));
  } catch {
    // quota exceeded — drop silently
  }
}

// Heuristic: should this string be translated?
function isTranslatable(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  // Pure numbers / punctuation / symbols / emojis → skip
  if (!/[A-Za-z]/.test(t)) return false;
  // Skip URLs/emails
  if (/^https?:\/\//i.test(t) || /\S+@\S+\.\S+/.test(t)) return false;
  return true;
}

function isInsideSkipped(node: Node): boolean {
  let el: Node | null = node;
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const e = el as Element;
      if (SKIP_TAGS.has(e.tagName)) return true;
      if (e.hasAttribute('data-no-translate')) return true;
      if (e.getAttribute('translate') === 'no') return true;
      if (e.classList?.contains('notranslate')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

// Collect visible text nodes whose original English content needs translating
function collectNodes(root: Node, cache: Cache, targetLang: string): Array<{ node: Text; original: string }> {
  const out: Array<{ node: Text; original: string }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const text = n.nodeValue || '';
      if (!isTranslatable(text)) return NodeFilter.FILTER_REJECT;
      if (isInsideSkipped(n)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) {
    const node = n as Text;
    const parent = node.parentElement;
    if (!parent) continue;

    // Recover the original English source for this text node
    const original = parent.getAttribute(ATTR_ORIGINAL) || (node.nodeValue || '');
    const trimmed = original.trim();
    if (!trimmed) continue;

    // Already shows the target translation? skip.
    const cached = cache[trimmed];
    if (cached && (node.nodeValue || '').trim() === cached.trim()) continue;

    // English target — restore original if it's been swapped.
    if (targetLang === 'en') {
      if ((node.nodeValue || '').trim() !== trimmed) {
        node.nodeValue = (node.nodeValue || '').replace(node.nodeValue!.trim(), trimmed);
      }
      continue;
    }

    out.push({ node, original: trimmed });
  }
  return out;
}

function applyTranslation(node: Text, original: string, translated: string) {
  if (!node.nodeValue) return;
  // Preserve leading/trailing whitespace
  const raw = node.nodeValue;
  const leading = raw.match(/^\s*/)?.[0] ?? '';
  const trailing = raw.match(/\s*$/)?.[0] ?? '';
  node.nodeValue = leading + translated + trailing;
  const parent = node.parentElement;
  if (parent && !parent.getAttribute(ATTR_ORIGINAL)) {
    parent.setAttribute(ATTR_ORIGINAL, original);
  }
}

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  const { data: { session } } = await (await getSupabase()).auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  else if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }

  const resp = await fetch(TRANSLATE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ texts, targetLang }),
  });
  if (!resp.ok) throw new Error(`translate-batch failed: ${resp.status}`);
  const json = await resp.json();
  return Array.isArray(json.translations) ? json.translations : texts;
}

export default function AutoTranslateProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const language = i18n.language || 'en';
  const [isTranslating, setIsTranslating] = useState(false);
  const cacheRef = useRef<Cache>(loadCache(language));
  const langRef = useRef<string>(language);
  const previousLanguageRef = useRef<string>(language);
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);

  // Keep cacheRef in sync with the active language. On the overwhelmingly
  // common initial English render there is nothing to translate or restore, so
  // avoid an unnecessary full-document TreeWalker pass during app startup.
  useEffect(() => {
    const previousLanguage = previousLanguageRef.current;
    previousLanguageRef.current = language;
    langRef.current = language;
    cacheRef.current = loadCache(language);
    if (language === 'en' && previousLanguage === 'en') return;
    void translateRoot(document.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Core translate routine for any subtree
  async function translateRoot(root: Node) {
    const targetLang = langRef.current;
    const cache = cacheRef.current;
    const found = collectNodes(root, cache, targetLang);
    if (found.length === 0) return;

    // 1) Apply any cached translations immediately (no network)
    const need: Array<{ node: Text; original: string }> = [];
    for (const item of found) {
      const cached = cache[item.original];
      if (cached) applyTranslation(item.node, item.original, cached);
      else need.push(item);
    }
    if (need.length === 0 || targetLang === 'en') return;

    // 2) Dedupe untranslated originals and queue them
    const uniques = Array.from(new Set(need.map(n => n.original)));
    const fresh = uniques.filter(s => !pendingRef.current.has(s));
    fresh.forEach(s => pendingRef.current.add(s));
    if (fresh.length === 0) return;

    setIsTranslating(true);
    try {
      // Batch in chunks of 60 to keep prompts compact
      for (let i = 0; i < fresh.length; i += 60) {
        const chunk = fresh.slice(i, i + 60);
        try {
          const translated = await translateBatch(chunk, targetLang);
          // If language changed mid-flight, abort applying these
          if (langRef.current !== targetLang) return;
          chunk.forEach((src, idx) => {
            const tr = translated[idx];
            if (typeof tr === 'string' && tr.trim().length > 0) {
              cache[src] = tr;
            }
          });
          saveCache(targetLang, cache);
        } catch (err) {
          console.warn('[AutoTranslate] batch failed', err);
        } finally {
          chunk.forEach(s => pendingRef.current.delete(s));
        }
      }

      // Apply the new translations to the nodes from this subtree directly.
      // The old implementation walked document.body a second time after every
      // batch, which becomes very expensive on long Dashboard/Progress pages.
      for (const item of need) {
        if (!item.node.isConnected) continue;
        const tr = cache[item.original];
        if (tr) applyTranslation(item.node, item.original, tr);
      }
    } finally {
      setIsTranslating(false);
    }
  }

  // Watch for new DOM (route changes, dialogs, lazy content).
  // Skip the observer entirely when language is English — most users — so we
  // don't pay the cost of inspecting every mutation across the app.
  useEffect(() => {
    if (language === 'en') return;
    const observer = new MutationObserver((mutations) => {
      if (langRef.current === 'en') return; // nothing to translate
      // Debounce — coalesce rapid mutations into one pass
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        const roots = new Set<Node>();
        for (const m of mutations) {
          m.addedNodes.forEach(n => {
            if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) roots.add(n);
          });
          if (m.type === 'characterData' && m.target) roots.add(m.target);
        }
        roots.forEach(r => void translateRoot(r));
      }, 180);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const value = useMemo(() => ({ isTranslating, language }), [isTranslating, language]);
  return <AutoTranslateCtx.Provider value={value}>{children}</AutoTranslateCtx.Provider>;
}
