export const SESSION_COOKIE_NAME = "snap_session";

// Configurable session duration in hours (SESSION_HOURS env var, default 12)
export function getSessionHours(): number {
  const parsed = Number(process.env.SESSION_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}

export const SESSION_DURATION_HOURS = getSessionHours();
export const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;
export const SESSION_DURATION_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

/**
 * Validates a redirect target to prevent open redirects.
 * Only allows relative paths starting with a single "/".
 */
export function getSafeRedirectTarget(
  from: string | null | undefined,
  fallback: string = "/admin/queue"
): string {
  if (!from || typeof from !== "string") return fallback;
  const trimmed = from.trim();
  // Must start with exactly one "/" and not "//" (protocol-relative URL)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return fallback;
}

export interface SessionPayload {
  role: "operator";
  iat: number;
  exp: number;
}

/**
 * Constant-time comparison between input PIN and expected operator PIN.
 * Edge and Node compatible constant-time check.
 */
export function verifyPin(inputPin: string, expectedPin: string | undefined): boolean {
  if (!inputPin || !expectedPin) return false;

  const a = inputPin.trim();
  const b = expectedPin.trim();

  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Universal URL-safe Base64 helpers (Edge & Node compatible)
 */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeStr(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

function base64UrlDecodeStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Computes an HMAC-SHA256 signature for a message using the Web Crypto API.
 * 100% compatible with Edge runtime (middleware) and Node.js.
 */
async function signMessageWebCrypto(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

/**
 * Creates a signed session token: {payload_base64}.{signature_base64}
 */
export async function createSessionToken(secret: string): Promise<string> {
  if (!secret) {
    throw new Error("SESSION_SECRET is required to sign session tokens");
  }

  const now = Date.now();
  const payload: SessionPayload = {
    role: "operator",
    iat: now,
    exp: now + SESSION_DURATION_MS,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncodeStr(payloadStr);
  const signature = await signMessageWebCrypto(payloadB64, secret);

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token without any database calls.
 * Returns the payload if valid and not expired, null otherwise.
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | undefined
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, providedSig] = parts;

  try {
    const expectedSig = await signMessageWebCrypto(payloadB64, secret);
    if (providedSig !== expectedSig) {
      return null;
    }

    const jsonStr = base64UrlDecodeStr(payloadB64);
    const payload: SessionPayload = JSON.parse(jsonStr);

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    if (payload.role !== "operator") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
