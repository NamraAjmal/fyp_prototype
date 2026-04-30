export type UserRole = string;

export interface AuthSession {
  email: string;
  displayName: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationPlan?: "free" | "premium";
  isUpgraded?: boolean;
  loginAt: string;
}

const AUTH_SESSION_KEY = "fyp-auth-session";

function hasWindow() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function getAuthSession(): AuthSession | null {
  if (!hasWindow()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function updateAuthSession(updates: Partial<AuthSession>) {
  const current = getAuthSession();
  if (!current || !hasWindow()) {
    return;
  }

  window.localStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({ ...current, ...updates })
  );
}

export function clearAuthSession() {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function buildAuthHeaders() {
  const session = getAuthSession();

  if (!session) {
    return {};
  }

  const headers: Record<string, string> = {};

  if (session.role) headers["X-User-Role"] = session.role;
  if (session.organizationId) headers["X-Company-ID"] = session.organizationId;
  if (session.organizationName)
    headers["X-Company-Name"] = session.organizationName;
  if (session.email) headers["X-User-Email"] = session.email;

  return headers;
}
