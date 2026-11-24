from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def edit(rel: str, transform):
    path = ROOT / rel
    before = path.read_text(encoding="utf-8")
    after = transform(before)
    if after == before:
        print(f"[security] no change: {rel}")
    else:
        path.write_text(after, encoding="utf-8")
        print(f"[security] updated: {rel}")


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Required security patch anchor missing: {label}")
    return text.replace(old, new)


# 1) Remove diagnostic Paystack UI from the production application bundle.
def harden_app(text: str) -> str:
    for line in [
        'const PaystackDevPanel = lazyWithRetry(() => import("./pages/PaystackDevPanel"));\n',
        'const PaystackHealthCheck = lazyWithRetry(() => import("./pages/PaystackHealthCheck"));\n',
        'const PaystackWebhookEvents = lazyWithRetry(() => import("./pages/PaystackWebhookEvents"));\n',
        '          <Route path="/dev/paystack" element={<PaystackDevPanel />} />\n',
        '          <Route path="/dev/paystack/health" element={<PaystackHealthCheck />} />\n',
        '          <Route path="/dev/paystack/events" element={<PaystackWebhookEvents />} />\n',
    ]:
        text = text.replace(line, '')
    return text


edit('src/App.tsx', harden_app)
for rel in [
    'src/pages/PaystackDevPanel.tsx',
    'src/pages/PaystackHealthCheck.tsx',
    'src/pages/PaystackWebhookEvents.tsx',
]:
    path = ROOT / rel
    if path.exists():
        path.unlink()
        print(f"[security] removed diagnostic page: {rel}")


# 2) Never write raw account email addresses into Edge Function logs.
def harden_auth_email(text: str) -> str:
    text = replace_required(
        text,
        "console.log('Received auth event', { emailType, email: payload.data.email, run_id })",
        "console.log('Received auth event', { emailType, run_id })",
        'auth-email-hook received-event PII log',
    )
    text = replace_required(
        text,
        "console.log('Auth email enqueued', { emailType, email: payload.data.email, run_id })",
        "console.log('Auth email enqueued', { emailType, run_id })",
        'auth-email-hook enqueue PII log',
    )
    return text


edit('supabase/functions/auth-email-hook/index.ts', harden_auth_email)


# 3) Validate unsubscribe tokens before privileged lookup and remove PII/secrets from logs.
def harden_unsubscribe(text: str) -> str:
    text = replace_required(
        text,
        """  if (!token) {\n    return jsonResponse({ error: 'Token is required' }, 400)\n  }\n\n  const supabase = createClient(supabaseUrl, supabaseServiceKey)""",
        """  if (typeof token !== 'string' || !token.trim()) {\n    return jsonResponse({ error: 'Token is required' }, 400)\n  }\n  token = token.trim()\n  if (!/^[a-f0-9]{64}$/i.test(token)) {\n    return jsonResponse({ error: 'Invalid token format' }, 400)\n  }\n\n  const supabase = createClient(supabaseUrl, supabaseServiceKey)""",
        'unsubscribe token validation',
    )
    text = re.sub(
        r"console\.error\('Failed to mark token as used', \{\s*error: updateError, token\s*\}\)",
        "console.error('Failed to mark token as used', { error: updateError })",
        text,
    )
    text = re.sub(
        r"console\.error\('Failed to suppress email', \{\s*error: suppressError,\s*email: tokenRecord\.email,\s*\}\)",
        "console.error('Failed to suppress email', { error: suppressError })",
        text,
    )
    text = text.replace(
        "console.log('Email unsubscribed', { email: tokenRecord.email })",
        "console.log('Email unsubscribed')",
    )
    return text


edit('supabase/functions/handle-email-unsubscribe/index.ts', harden_unsubscribe)


# 4) Keep transactional-email logs useful without exposing recipient PII.
def harden_transactional_email(text: str) -> str:
    replacements = [
        (
            """console.error('Suppression check failed — refusing to send', {\n      error: suppressionError,\n      effectiveRecipient,\n    })""",
            "console.error('Suppression check failed — refusing to send', { error: suppressionError })",
        ),
        (
            "console.log('Email suppressed', { effectiveRecipient, templateName })",
            "console.log('Email suppressed', { templateName })",
        ),
        (
            """console.error('Token lookup failed', {\n      error: tokenLookupError,\n      email: normalizedEmail,\n    })""",
            "console.error('Token lookup failed', { error: tokenLookupError })",
        ),
        (
            """console.error('Failed to read back unsubscribe token after upsert', {\n        error: reReadError,\n        email: normalizedEmail,\n      })""",
            "console.error('Failed to read back unsubscribe token after upsert', { error: reReadError })",
        ),
        (
            """console.warn('Unsubscribe token already used but email not suppressed', {\n      email: normalizedEmail,\n    })""",
            "console.warn('Unsubscribe token already used but email not suppressed')",
        ),
        (
            """console.error('Failed to enqueue email', {\n      error: enqueueError,\n      templateName,\n      effectiveRecipient,\n    })""",
            "console.error('Failed to enqueue email', { error: enqueueError, templateName })",
        ),
        (
            "console.log('Transactional email enqueued', { templateName, effectiveRecipient })",
            "console.log('Transactional email enqueued', { templateName })",
        ),
    ]
    for old, new in replacements:
        text = replace_required(text, old, new, old.splitlines()[0])
    return text


edit('supabase/functions/send-transactional-email/index.ts', harden_transactional_email)


# 5) Static allow-list for share navigation. User-controlled strings never become destinations.
def harden_referral(text: str) -> str:
    anchor = """  const openExternal = (href: string, newTab = false) => {\n    try {"""
    replacement = """  const isAllowedShareHref = (href: string) => {\n    if (href.startsWith('mailto:')) return true;\n    try {\n      const url = new URL(href);\n      return url.protocol === 'https:' &&\n        (url.hostname === 'api.whatsapp.com' || url.hostname === 'www.facebook.com');\n    } catch {\n      return false;\n    }\n  };\n\n  const openExternal = (href: string, newTab = false) => {\n    if (!isAllowedShareHref(href)) {\n      toast.error('Could not open share.');\n      return;\n    }\n    try {"""
    return replace_required(text, anchor, replacement, 'Referral external-navigation allowlist')


edit('src/pages/Referral.tsx', harden_referral)


def harden_invite_card(text: str) -> str:
    anchor = """    try {\n      if (channel === 'whatsapp') {"""
    replacement = """    const hrefAllowed = (() => {\n      if (channel === 'sms') return href.startsWith('sms:');\n      if (channel === 'email') return href.startsWith('mailto:');\n      if (channel === 'whatsapp') {\n        try {\n          const url = new URL(href);\n          return url.protocol === 'https:' && url.hostname === 'api.whatsapp.com';\n        } catch {\n          return false;\n        }\n      }\n      return false;\n    })();\n    if (!hrefAllowed) {\n      await fallbackToClipboard('error');\n      return;\n    }\n\n    try {\n      if (channel === 'whatsapp') {"""
    return replace_required(text, anchor, replacement, 'InviteEarnCard navigation allowlist')


edit('src/components/InviteEarnCard.tsx', harden_invite_card)

print('[security] source hardening complete')
