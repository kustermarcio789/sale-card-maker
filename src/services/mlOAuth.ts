const ML_OAUTH_STORAGE_KEY = "ml_oauth_session";

export interface MLOAuthSession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  return toBase64Url(new Uint8Array(digest));
}

export function resolveMLRedirectUri(): string {
  const configuredRedirectUri = import.meta.env.VITE_ML_REDIRECT_URI?.trim();
  return configuredRedirectUri || `${window.location.origin}/ml-callback`;
}

export async function createMLOAuthSession(): Promise<
  MLOAuthSession & { codeChallenge: string }
> {
  const session: MLOAuthSession = {
    state: randomString(32),
    codeVerifier: randomString(64),
    redirectUri: resolveMLRedirectUri(),
  };

  sessionStorage.setItem(ML_OAUTH_STORAGE_KEY, JSON.stringify(session));

  return {
    ...session,
    codeChallenge: await createCodeChallenge(session.codeVerifier),
  };
}

export function getStoredMLOAuthSession(): MLOAuthSession | null {
  const rawSession = sessionStorage.getItem(ML_OAUTH_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<MLOAuthSession>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.redirectUri !== "string"
    ) {
      return null;
    }

    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      redirectUri: parsed.redirectUri,
    };
  } catch {
    return null;
  }
}

export function clearStoredMLOAuthSession(): void {
  sessionStorage.removeItem(ML_OAUTH_STORAGE_KEY);
}
