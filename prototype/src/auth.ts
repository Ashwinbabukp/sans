const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? "";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

const IDENTITY_TOOLKIT_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE_URL = "https://securetoken.googleapis.com/v1";
const SESSION_NAMESPACE = FIREBASE_API_KEY ? FIREBASE_API_KEY.slice(-12) : "unconfigured";
const SESSION_STORAGE_KEY = `quotes.auth.session.v1:${SESSION_NAMESPACE}`;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export const firebaseAuthConfigured = FIREBASE_API_KEY.length > 0;
export const googleAuthConfigured = firebaseAuthConfigured && GOOGLE_CLIENT_ID.length > 0;

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  providerId: "password" | "google.com" | null;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL:
    "An account already exists for this email. Sign in with the original method first.",
  API_KEY_INVALID: "Authentication is not configured correctly.",
  AUTH_NOT_CONFIGURED: "Authentication is not configured yet.",
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "Please sign in again before updating your profile.",
  EMAIL_EXISTS: "An account already exists for this email.",
  EMAIL_NOT_FOUND: "No account was found for this email.",
  FEDERATED_USER_ID_ALREADY_LINKED: "This Google account is already linked to another user.",
  GOOGLE_AUTH_NOT_CONFIGURED: "Google sign-in is not configured yet.",
  INVALID_CREDENTIAL: "That sign-in credential is invalid or has expired.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_GRANT_TYPE: "Your saved session is invalid. Please sign in again.",
  INVALID_IDP_RESPONSE: "Google sign-in could not be verified. Please try again.",
  INVALID_ID_TOKEN: "Your session is invalid. Please sign in again.",
  INVALID_LOGIN_CREDENTIALS: "The email or password is incorrect.",
  INVALID_PASSWORD: "The email or password is incorrect.",
  INVALID_REFRESH_TOKEN: "Your saved session has expired. Please sign in again.",
  MISSING_EMAIL: "Enter your email address.",
  MISSING_PASSWORD: "Enter your password.",
  MISSING_REFRESH_TOKEN: "Your saved session is invalid. Please sign in again.",
  NETWORK_REQUEST_FAILED: "Unable to reach the sign-in service. Check your connection and try again.",
  OPERATION_NOT_ALLOWED: "This sign-in method is not enabled.",
  PROJECT_NUMBER_MISMATCH: "Your saved session belongs to a different project. Please sign in again.",
  TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please wait a moment and try again.",
  USER_DISABLED: "This account has been disabled.",
  USER_NOT_FOUND: "This account no longer exists.",
  WEAK_PASSWORD: "Choose a stronger password with at least six characters.",
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const nullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.length > 0 ? value : null;
};

const messageForCode = (code: string) =>
  AUTH_ERROR_MESSAGES[code] ?? "Authentication failed. Please try again.";

const normalizeFirebaseErrorCode = (message: string): string => {
  if (/api key not valid/i.test(message)) return "API_KEY_INVALID";

  const code = message.split(" : ", 1)[0]?.trim().toUpperCase();
  return code?.replace(/[^A-Z0-9_]/g, "_") || "AUTH_REQUEST_FAILED";
};

const authErrorFromResponse = (payload: unknown, status: number): AuthError => {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const rawMessage = nonEmptyString(error?.message);
  const code = rawMessage
    ? normalizeFirebaseErrorCode(rawMessage)
    : status === 429
      ? "TOO_MANY_ATTEMPTS_TRY_LATER"
      : "AUTH_REQUEST_FAILED";

  return new AuthError(code, messageForCode(code));
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!response.ok) return null;
    throw new AuthError("INVALID_RESPONSE", "The sign-in service returned an invalid response.", {
      cause: error,
    });
  }
};

const request = async (url: string, init: RequestInit): Promise<JsonRecord> => {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new AuthError("NETWORK_REQUEST_FAILED", messageForCode("NETWORK_REQUEST_FAILED"), {
      cause: error,
    });
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) throw authErrorFromResponse(payload, response.status);
  if (!isRecord(payload)) {
    throw new AuthError("INVALID_RESPONSE", "The sign-in service returned an invalid response.");
  }

  return payload;
};

const assertFirebaseConfigured = () => {
  if (!firebaseAuthConfigured) {
    throw new AuthError("AUTH_NOT_CONFIGURED", messageForCode("AUTH_NOT_CONFIGURED"));
  }
};

const assertGoogleConfigured = () => {
  assertFirebaseConfigured();
  if (!GOOGLE_CLIENT_ID) {
    throw new AuthError(
      "GOOGLE_AUTH_NOT_CONFIGURED",
      messageForCode("GOOGLE_AUTH_NOT_CONFIGURED"),
    );
  }
};

const firebaseUrl = (path: string) => {
  assertFirebaseConfigured();
  return `${IDENTITY_TOOLKIT_BASE_URL}/${path}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
};

const secureTokenUrl = () => {
  assertFirebaseConfigured();
  return `${SECURE_TOKEN_BASE_URL}/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
};

const jsonRequest = (body: JsonRecord): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const commitSession = (user: AuthUser) => {
  try {
    getStorage()?.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Authentication can continue for this page even if storage is unavailable.
  }
};

const clearSession = () => {
  try {
    getStorage()?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // There is no local session to clear when browser storage is unavailable.
  }
};

const parseExpiry = (value: unknown): number | null => {
  const expiresInSeconds = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return null;
  return Date.now() + expiresInSeconds * 1_000;
};

const toAuthUser = (
  payload: JsonRecord,
  providerId: AuthUser["providerId"],
  fallback?: AuthUser,
): AuthUser => {
  const uid = nonEmptyString(payload.localId) ?? fallback?.uid ?? null;
  const idToken = nonEmptyString(payload.idToken) ?? fallback?.idToken ?? null;
  const refreshToken = nonEmptyString(payload.refreshToken) ?? fallback?.refreshToken ?? null;
  const expiresAt = parseExpiry(payload.expiresIn) ?? fallback?.expiresAt ?? null;

  if (!uid || !idToken || !refreshToken || !expiresAt) {
    throw new AuthError("INVALID_RESPONSE", "The sign-in service returned an incomplete response.");
  }

  return {
    uid,
    email: typeof payload.email === "string" ? nullableString(payload.email) : (fallback?.email ?? null),
    displayName:
      typeof payload.displayName === "string"
        ? nullableString(payload.displayName)
        : (fallback?.displayName ?? null),
    photoUrl:
      typeof payload.photoUrl === "string"
        ? nullableString(payload.photoUrl)
        : (fallback?.photoUrl ?? null),
    providerId,
    idToken,
    refreshToken,
    expiresAt,
  };
};

const isStoredAuthUser = (value: unknown): value is AuthUser => {
  if (!isRecord(value)) return false;

  const providerId = value.providerId;
  return (
    nonEmptyString(value.uid) !== null &&
    (value.email === null || typeof value.email === "string") &&
    (value.displayName === null || typeof value.displayName === "string") &&
    (value.photoUrl === null || typeof value.photoUrl === "string") &&
    (providerId === null || providerId === "password" || providerId === "google.com") &&
    nonEmptyString(value.idToken) !== null &&
    nonEmptyString(value.refreshToken) !== null &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt)
  );
};

const readStoredSession = (): AuthUser | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const serialized = storage.getItem(SESSION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    if (isStoredAuthUser(parsed)) return parsed;
  } catch {
    // Invalid or unavailable storage is treated as a signed-out session.
  }

  clearSession();
  return null;
};

const refreshSession = async (user: AuthUser): Promise<AuthUser> => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: user.refreshToken,
  });
  const payload = await request(secureTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const uid = nonEmptyString(payload.user_id);
  const idToken = nonEmptyString(payload.id_token);
  const refreshToken = nonEmptyString(payload.refresh_token);
  const expiresAt = parseExpiry(payload.expires_in);
  if (!uid || !idToken || !refreshToken || !expiresAt) {
    throw new AuthError("INVALID_RESPONSE", "The token service returned an incomplete response.");
  }

  const refreshedUser: AuthUser = {
    ...user,
    uid,
    idToken,
    refreshToken,
    expiresAt,
  };
  return refreshedUser;
};

const withFreshToken = async (user: AuthUser): Promise<AuthUser> => {
  if (user.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) return user;
  return refreshSession(user);
};

export const getGoogleClientId = (): string | null => GOOGLE_CLIENT_ID || null;

export async function signInWithEmail(
  email: string,
  password: string,
  mode: "signIn" | "signUp",
): Promise<AuthUser> {
  assertFirebaseConfigured();
  const cleanEmail = email.trim();
  if (!cleanEmail) throw new AuthError("MISSING_EMAIL", messageForCode("MISSING_EMAIL"));
  if (!password) throw new AuthError("MISSING_PASSWORD", messageForCode("MISSING_PASSWORD"));

  const endpoint = mode === "signUp" ? "accounts:signUp" : "accounts:signInWithPassword";
  const payload = await request(
    firebaseUrl(endpoint),
    jsonRequest({ email: cleanEmail, password, returnSecureToken: true }),
  );
  return toAuthUser(payload, "password");
}

export async function signInWithGoogleCredential(googleIdToken: string): Promise<AuthUser> {
  assertGoogleConfigured();
  const credential = googleIdToken.trim();
  if (!credential) {
    throw new AuthError("INVALID_CREDENTIAL", messageForCode("INVALID_CREDENTIAL"));
  }

  const postBody = new URLSearchParams({
    id_token: credential,
    providerId: "google.com",
  }).toString();
  const requestUri = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const payload = await request(
    firebaseUrl("accounts:signInWithIdp"),
    jsonRequest({ requestUri, postBody, returnIdpCredential: true, returnSecureToken: true }),
  );

  if (payload.needConfirmation === true) {
    throw new AuthError(
      "ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL",
      messageForCode("ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL"),
    );
  }

  return toAuthUser(payload, "google.com");
}

export async function updateDisplayName(user: AuthUser, name: string): Promise<AuthUser> {
  const displayName = name.trim();
  if (!displayName) {
    throw new AuthError("INVALID_DISPLAY_NAME", "Enter a display name.");
  }

  const currentUser = await withFreshToken(user);
  const payload = await request(
    firebaseUrl("accounts:update"),
    jsonRequest({
      idToken: currentUser.idToken,
      displayName,
      returnSecureToken: true,
    }),
  );
  return toAuthUser(payload, currentUser.providerId, currentUser);
}

export async function restoreSession(): Promise<AuthUser | null> {
  if (!firebaseAuthConfigured) return null;
  const storedUser = readStoredSession();
  if (!storedUser) return null;
  if (storedUser.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) return storedUser;

  try {
    return await refreshSession(storedUser);
  } catch (error) {
    const invalidSessionCodes = new Set([
      "INVALID_GRANT_TYPE",
      "INVALID_REFRESH_TOKEN",
      "MISSING_REFRESH_TOKEN",
      "PROJECT_NUMBER_MISMATCH",
      "TOKEN_EXPIRED",
      "USER_DISABLED",
      "USER_NOT_FOUND",
    ]);
    if (error instanceof AuthError && invalidSessionCodes.has(error.code)) {
      clearSession();
      return null;
    }
    throw error;
  }
}

export function signOut(): void {
  clearSession();
}
