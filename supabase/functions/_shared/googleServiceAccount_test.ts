import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseServiceAccount } from "./googleServiceAccount.ts";

const KEY = "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n";
const file = { type: "service_account", client_email: "play@demo.iam.gserviceaccount.com", private_key: KEY, token_uri: "https://oauth2.googleapis.com/token" };

Deno.test("raw key file JSON is accepted", () => {
  const sa = parseServiceAccount(JSON.stringify(file));
  assertEquals(sa.client_email, file.client_email);
  assertEquals(sa.private_key, KEY);
});

Deno.test("JSON pasted wrapped in quotes is accepted", () => {
  assertEquals(parseServiceAccount(JSON.stringify(JSON.stringify(file))).client_email, file.client_email);
});

Deno.test("base64-encoded key file is accepted", () => {
  assertEquals(parseServiceAccount(btoa(JSON.stringify(file))).client_email, file.client_email);
});

Deno.test("escaped \\n line breaks in the private key are restored", () => {
  const escaped = JSON.stringify(file).replace(/\\n/g, "\\\\n");
  assertEquals(parseServiceAccount(escaped).private_key, KEY);
});

Deno.test("an untrusted token_uri falls back to Google's token endpoint", () => {
  assertEquals(parseServiceAccount(JSON.stringify({ ...file, token_uri: "https://evil.example/token" })).token_uri, "https://oauth2.googleapis.com/token");
});

Deno.test("wrong files are rejected with a safe reason", () => {
  assertThrows(() => parseServiceAccount("play@demo.iam.gserviceaccount.com"), Error, "not_json");
  assertThrows(() => parseServiceAccount(JSON.stringify({ web: { client_id: "x" } })), Error, "oauth_client_file_not_service_account_key");
  assertThrows(() => parseServiceAccount(JSON.stringify({ type: "service_account", client_email: "a@b" })), Error, "missing_private_key");
  assertThrows(() => parseServiceAccount(JSON.stringify({ ...file, private_key: "abc" })), Error, "private_key_not_pkcs8_pem");
});

Deno.test("error messages never contain the secret", () => {
  try {
    parseServiceAccount(JSON.stringify({ ...file, private_key: "SECRET-VALUE" }));
  } catch (e) {
    assertEquals(String(e).includes("SECRET-VALUE"), false);
  }
});
