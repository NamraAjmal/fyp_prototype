import { useEffect, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  Link,
  useSearchParams,
} from "react-router";
import {
  Menu,
  X,
  Building2,
  Scan,
  HardHat,
  Shield,
  LogOut,
  Home,
  Users,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";
import { clearAuthSession, getAuthSession } from "../services/authSession";
import {
  confirmCheckoutSession,
  createCheckoutSession,
  fetchBillingStatus,
} from "../services/billingApi";

function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState(getAuthSession());
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = sessionSnapshot;
  const role = (session?.role || "").toLowerCase();

  const isAdmin = role === "admin";
  const isOwner = role === "owner";
  const isManager = role === "manager";
  const isOperator = role === "operator";
  const isViewer = role === "viewer";
  const isUpgraded =
    session?.organizationPlan === "premium" || Boolean(session?.isUpgraded);
  const planLabel = isUpgraded ? "Paid" : "Free";
  const planBadgeClassName = isUpgraded
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";

  useEffect(() => {
    setSessionSnapshot(getAuthSession());
  }, [location.pathname]);

  useEffect(() => {
    if (!isOwner) return;

    fetchBillingStatus()
      .then(() => setSessionSnapshot(getAuthSession()))
      .catch(() => {
        // Billing state is helpful but should not block the dashboard.
      });
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;

    const upgradeStatus = searchParams.get("upgrade");
    const checkoutSessionId = searchParams.get("session_id");
    const clearCheckoutParams = () => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("upgrade");
      nextParams.delete("session_id");
      setSearchParams(nextParams, { replace: true });
    };

    if (upgradeStatus === "cancelled") {
      setUpgradeError("Upgrade was cancelled before payment.");
      clearCheckoutParams();
      return;
    }

    if (upgradeStatus !== "success" || !checkoutSessionId) {
      return;
    }

    setUpgradeLoading(true);
    setUpgradeError(null);
    confirmCheckoutSession(checkoutSessionId)
      .then(() => {
        setUpgradeMessage("Upgrade activated successfully.");
        setSessionSnapshot(getAuthSession());
      })
      .catch((err) =>
        setUpgradeError(
          err instanceof Error ? err.message : "Unable to confirm payment."
        )
      )
      .finally(() => {
        setUpgradeLoading(false);
        clearCheckoutParams();
      });
  }, [isOwner, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isViewer) return;

    if (
      location.pathname.startsWith("/dashboard/face-detection") &&
      location.pathname !== "/dashboard/face-detection/logs"
    ) {
      navigate("/dashboard/face-detection/logs", { replace: true });
      return;
    }
    if (
      location.pathname.startsWith("/dashboard/helmet-detection") &&
      location.pathname !== "/dashboard/helmet-detection/logs"
    ) {
      navigate("/dashboard/helmet-detection/logs", { replace: true });
      return;
    }
    if (
      location.pathname.startsWith("/dashboard/mask-detection") &&
      location.pathname !== "/dashboard/mask-detection/logs"
    ) {
      navigate("/dashboard/mask-detection/logs", { replace: true });
      return;
    }
    if (location.pathname === "/dashboard/organization/manage") {
      navigate("/dashboard", { replace: true });
    }
  }, [isViewer, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== "/dashboard/organization/manage") return;

    if (!isOwner) {
      navigate("/dashboard", { replace: true });
    }
  }, [isOwner, location.pathname, navigate]);

  useEffect(() => {
    if (!isAdmin) return;

    const allowed = ["/dashboard", "/dashboard/admin/organizations"];
    if (
      !allowed.some(
        (p) => location.pathname === p || location.pathname.startsWith(p)
      )
    ) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAdmin, location.pathname, navigate]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
    setShowLogoutConfirm(false);
  };

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    setUpgradeError(null);
    setUpgradeMessage(null);

    try {
      const data = await createCheckoutSession();
      if (data.already_upgraded) {
        setSessionSnapshot(getAuthSession());
        setUpgradeMessage("Your organization is already upgraded.");
        return;
      }
      if (!data.checkout_url) {
        throw new Error("Stripe did not return a checkout URL.");
      }
      window.location.href = data.checkout_url;
    } catch (err) {
      setUpgradeError(
        err instanceof Error ? err.message : "Unable to start Stripe Checkout."
      );
    } finally {
      setUpgradeLoading(false);
    }
  };

  const menuItems = isOwner
    ? [
        { path: "/dashboard", label: "Overview", icon: Home },
        {
          path: "/dashboard/face-detection",
          label: "Face",
          icon: Scan,
        },
        {
          path: "/dashboard/helmet-detection",
          label: "Helmet",
          icon: HardHat,
        },
        { path: "/dashboard/mask-detection", label: "Mask", icon: Shield },
        { path: "/dashboard/organization/manage", label: "Org", icon: Users },
      ]
    : isManager || isOperator
    ? [
        { path: "/dashboard", label: "Overview", icon: Home },
        {
          path: "/dashboard/face-detection",
          label: "Face",
          icon: Scan,
        },
        {
          path: "/dashboard/helmet-detection",
          label: "Helmet",
          icon: HardHat,
        },
        { path: "/dashboard/mask-detection", label: "Mask", icon: Shield },
      ]
    : isViewer
    ? [
        { path: "/dashboard", label: "Overview", icon: Home },
        {
          path: "/dashboard/face-detection/logs",
          label: "Face Feed",
          icon: Scan,
        },
        {
          path: "/dashboard/helmet-detection/logs",
          label: "Helmet Feed",
          icon: HardHat,
        },
        {
          path: "/dashboard/mask-detection/logs",
          label: "Mask Feed",
          icon: Shield,
        },
      ]
    : isAdmin
    ? [
        {
          path: "/dashboard/admin/organizations",
          label: "Organizations",
          icon: Building2,
        },
      ]
    : [{ path: "/dashboard", label: "Home", icon: Home }];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-linear-to-br from-slate-50 to-blue-50 text-slate-900">
      {/* NAVBAR */}
      <nav className="bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50 shadow-sm w-full">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-2">
            {/* LEFT */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-lg hover:bg-slate-100 lg:hidden cursor-pointer"
              >
                {menuOpen ? <X /> : <Menu />}
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>

                <div className="hidden sm:block truncate">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-sm font-semibold">
                      {session?.organizationName || "System Administrator"}
                    </h1>
                    {!isAdmin && session?.organizationName && (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${planBadgeClassName}`}
                        title={`${planLabel} plan`}
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {planLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {isAdmin
                      ? "System Administrator"
                      : isOwner
                      ? "Owner"
                      : isManager
                      ? "Manager"
                      : isOperator
                      ? "Operator"
                      : "Viewer"}
                  </p>
                </div>
              </div>
            </div>

            {/* CENTER NAV */}
            <div className="hidden lg:flex items-center gap-1 flex-wrap justify-center">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  <item.icon className="w-4 h-4" />
                  <span className="truncate max-w-25">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500 text-white text-sm cursor-pointer hover:bg-red-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden">
          <div className="w-64 bg-white h-full p-5">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 py-3 cursor-pointer hover:text-blue-600 transition-colors"
              >
                <item.icon />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <LogOut className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                Confirm Logout
              </h3>
            </div>

            <p className="text-slate-600 mb-6">
              Are you sure you want to logout? You will need to login again to
              access your dashboard.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full">
        {isOwner && !isUpgraded && (
          <section className="mb-6 rounded-lg border border-cyan-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-cyan-700">
                  <CreditCard className="w-5 h-5" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Upgrade your organization
                  </h2>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "Unlimited members in organization",
                    "Export option availability",
                    "Periodic email reports",
                  ].map((perk) => (
                    <span
                      key={perk}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {perk}
                    </span>
                  ))}
                </div>
                {upgradeError && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    {upgradeError}
                  </p>
                )}
                {upgradeMessage && (
                  <p className="mt-3 text-sm font-medium text-green-700">
                    {upgradeMessage}
                  </p>
                )}
              </div>

              <button
                onClick={handleUpgrade}
                disabled={upgradeLoading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700 disabled:opacity-60"
              >
                {upgradeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Upgrade with Stripe
              </button>
            </div>
          </section>
        )}
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;
