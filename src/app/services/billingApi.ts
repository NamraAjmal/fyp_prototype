import {
  buildAuthHeaders,
  getAuthSession,
  updateAuthSession,
} from "./authSession";

const API_BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000";

interface BillingPayload {
  plan?: string;
  is_upgraded?: boolean;
}

function syncBillingToSession(billing?: BillingPayload) {
  if (!billing) return;

  updateAuthSession({
    organizationPlan: billing.plan === "premium" ? "premium" : "free",
    isUpgraded: Boolean(billing.is_upgraded),
  });
}

export function hasPremiumAccess() {
  const session = getAuthSession();
  return (
    session?.organizationPlan === "premium" || Boolean(session?.isUpgraded)
  );
}

export async function fetchBillingStatus() {
  const res = await fetch(`${API_BASE}/billing/status`, {
    headers: buildAuthHeaders(),
  });
  const result = await res.json();

  if (!res.ok || result.status !== "success") {
    throw new Error(result?.message || "Unable to load billing status");
  }

  syncBillingToSession(result?.data?.billing);
  return result?.data?.billing as BillingPayload;
}

export async function createCheckoutSession() {
  const res = await fetch(`${API_BASE}/billing/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({ origin: window.location.origin }),
  });
  const result = await res.json();

  if (!res.ok || result.status !== "success") {
    throw new Error(result?.message || "Unable to start Stripe Checkout");
  }

  syncBillingToSession(result?.data?.billing);
  return result?.data as { checkout_url?: string; already_upgraded?: boolean };
}

export async function confirmCheckoutSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/billing/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  const result = await res.json();

  if (!res.ok || result.status !== "success") {
    throw new Error(result?.message || "Unable to confirm Stripe payment");
  }

  syncBillingToSession(result?.data?.billing);
  return result?.data?.billing as BillingPayload;
}
