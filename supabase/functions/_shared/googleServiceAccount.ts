// Reads the GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret tolerantly. People paste the
// key file in several shapes (raw JSON, JSON wrapped in quotes, base64, or with
// the private key's line breaks escaped as "\n"). Errors name only the problem,
// never any part of the secret, so they are safe to log.

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

export class ServiceAccountError extends Error {
  constructor(reason: string) {
    super(`invalid_service_account:${reason}`);
    this.name = "ServiceAccountError";
  }
}

function tryJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function tryBase64Json(text: string): unknown {
  const compact = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return undefined;
  try {
    return JSON.parse(atob(compact.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return undefined;
  }
}

export function parseServiceAccount(raw: string): GoogleServiceAccount {
  let value: unknown = raw;
  // Unwrap up to three layers of string encoding (quoted JSON / base64).
  for (let i = 0; i < 3 && typeof value === "string"; i++) {
    const text = value.trim();
    if (!text) throw new ServiceAccountError("empty");
    const next = tryJson(text) ?? tryBase64Json(text);
    if (next === undefined) throw new ServiceAccountError("not_json");
    value = next;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceAccountError("not_json_object");
  }
  const obj = value as Record<string, unknown>;
  if (obj.web || obj.installed) throw new ServiceAccountError("oauth_client_file_not_service_account_key");
  if (typeof obj.type === "string" && obj.type !== "service_account") {
    throw new ServiceAccountError("wrong_type_expected_service_account");
  }

  const missing = ["client_email", "private_key"].filter(
    (k) => typeof obj[k] !== "string" || !(obj[k] as string).trim(),
  );
  if (missing.length) throw new ServiceAccountError(`missing_${missing.join("_and_")}`);

  const privateKey = (obj.private_key as string).replace(/\\n/g, "\n");
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new ServiceAccountError("private_key_not_pkcs8_pem");
  }

  const tokenUri = typeof obj.token_uri === "string" && obj.token_uri.startsWith("https://oauth2.googleapis.com/")
    ? obj.token_uri
    : DEFAULT_TOKEN_URI;

  return { client_email: (obj.client_email as string).trim(), private_key: privateKey, token_uri: tokenUri };
}
