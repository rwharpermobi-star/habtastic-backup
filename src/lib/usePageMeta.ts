import { useEffect } from 'react';

/**
 * Lightweight per-page <title>, meta description, and canonical setter.
 * Runs client-side only — good enough for JS-executing crawlers (Googlebot).
 * Restores previous values on unmount so navigating away doesn't leave stale tags.
 */
export function usePageMeta({
  title,
  description,
  canonicalPath,
}: {
  title: string;
  description?: string;
  canonicalPath?: string;
}) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const ensureTag = (selector: string, create: () => HTMLElement) => {
      let el = document.head.querySelector<HTMLElement>(selector);
      let created = false;
      if (!el) {
        el = create();
        document.head.appendChild(el);
        created = true;
      }
      return { el, created };
    };

    const cleanups: Array<() => void> = [() => { document.title = prevTitle; }];

    if (description) {
      const { el, created } = ensureTag('meta[name="description"]', () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'description');
        return m;
      });
      const prev = el.getAttribute('content');
      el.setAttribute('content', description);
      cleanups.push(() => {
        if (created) el.remove();
        else if (prev !== null) el.setAttribute('content', prev);
      });

      // og:description mirror
      const og = ensureTag('meta[property="og:description"]', () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:description');
        return m;
      });
      const prevOg = og.el.getAttribute('content');
      og.el.setAttribute('content', description);
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (prevOg !== null) og.el.setAttribute('content', prevOg);
      });
    }

    // og:title mirror
    const ogTitle = ensureTag('meta[property="og:title"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:title');
      return m;
    });
    const prevOgTitle = ogTitle.el.getAttribute('content');
    ogTitle.el.setAttribute('content', title);
    cleanups.push(() => {
      if (ogTitle.created) ogTitle.el.remove();
      else if (prevOgTitle !== null) ogTitle.el.setAttribute('content', prevOgTitle);
    });

    // twitter:title mirror
    const twTitle = ensureTag('meta[name="twitter:title"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('name', 'twitter:title');
      return m;
    });
    const prevTwTitle = twTitle.el.getAttribute('content');
    twTitle.el.setAttribute('content', title);
    cleanups.push(() => {
      if (twTitle.created) twTitle.el.remove();
      else if (prevTwTitle !== null) twTitle.el.setAttribute('content', prevTwTitle);
    });

    if (description) {
      const twDesc = ensureTag('meta[name="twitter:description"]', () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'twitter:description');
        return m;
      });
      const prevTwDesc = twDesc.el.getAttribute('content');
      twDesc.el.setAttribute('content', description);
      cleanups.push(() => {
        if (twDesc.created) twDesc.el.remove();
        else if (prevTwDesc !== null) twDesc.el.setAttribute('content', prevTwDesc);
      });
    }

    if (canonicalPath) {
      const href = `https://habtastic.com${canonicalPath}`;
      const { el, created } = ensureTag('link[rel="canonical"]', () => {
        const l = document.createElement('link');
        l.setAttribute('rel', 'canonical');
        return l;
      });
      const prev = el.getAttribute('href');
      el.setAttribute('href', href);
      cleanups.push(() => {
        if (created) el.remove();
        else if (prev !== null) el.setAttribute('href', prev);
      });

      // og:url must self-reference the same route as the canonical, otherwise
      // crawlers attribute this page's preview to another URL.
      const ogUrl = ensureTag('meta[property="og:url"]', () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:url');
        return m;
      });
      const prevOgUrl = ogUrl.el.getAttribute('content');
      ogUrl.el.setAttribute('content', href);
      cleanups.push(() => {
        if (ogUrl.created) ogUrl.el.remove();
        else if (prevOgUrl !== null) ogUrl.el.setAttribute('content', prevOgUrl);
      });
    }


    return () => { cleanups.forEach((fn) => fn()); };
  }, [title, description, canonicalPath]);
}
