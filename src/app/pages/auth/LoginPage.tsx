import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Building2,
  Sparkles,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { saveAuthSession } from "../../services/authSession";

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({
    identifier: "",
    password: "",
  });

  const currentYear = new Date().getFullYear();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: loginForm.identifier.trim(),
          password: loginForm.password,
        }),
      });

      const result = await res.json();

      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Invalid email/username or password");
        return;
      }

      const user = result?.data?.user;
      if (!user?.email || !user?.role) {
        setError("Unable to authenticate. Please contact support.");
        return;
      }

      const role = String(user.role).toLowerCase();
      const organizationId = String(user.organization_id || "global");
      const billing = user.billing || {};
      const destination = "/dashboard";

      saveAuthSession({
        email: String(user.email),
        displayName: String(user.display_name || user.email),
        role,
        organizationId,
        organizationName: String(user.organization_name || organizationId),
        organizationPlan: billing.plan === "premium" ? "premium" : "free",
        isUpgraded: Boolean(billing.is_upgraded),
        loginAt: new Date().toISOString(),
      });

      navigate(destination);
    } catch (err) {
      // Check if it's a network error (backend not running)
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(
          "Unable to connect to the server. Please try again later or contact system administrator."
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="mx-auto max-w-5xl w-full px-4">
          {/* Logo/Brand */}
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
            <div className="text-left self-center animate-in fade-in slide-in-from-top duration-700">
              <div className="mt-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-blue-500 to-teal-500 mb-4 shadow-xl shadow-blue-500/50">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <br />
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/90 backdrop-blur-sm">
                <Shield className="w-4 h-4" />
                Role-based access
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight max-w-xl">
                Smart City Access Portal
              </h1>
              <p className="text-slate-200/90 text-base max-w-lg leading-7">
                Login-only B2B access. Your view is automatically loaded from
                your assigned access level and organization profile.
              </p>
            </div>

            {/* Glassmorphism card */}
            <div className="relative backdrop-blur-xl bg-slate-950/72 rounded-3xl shadow-2xl border border-white/15 p-8 animate-in fade-in slide-in-from-bottom duration-700">
              {/* Gradient overlay for extra depth */}
              <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-cyan-500/8 via-transparent to-emerald-500/8 pointer-events-none"></div>

              {/* Content */}
              <div className="relative">
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Welcome Back
                  </h2>
                  <p className="text-slate-300/85 text-sm">
                    Sign in to continue
                  </p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  {/* Email/Username field */}
                  <div className="space-y-2">
                    <label
                      htmlFor="login-identifier"
                      className="text-sm font-medium text-slate-100 flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Email or Username
                    </label>
                    <div className="relative group">
                      <input
                        id="login-identifier"
                        type="text"
                        value={loginForm.identifier}
                        onChange={(e) =>
                          setLoginForm({
                            ...loginForm,
                            identifier: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-slate-900/75 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400/70 focus:bg-slate-900 transition-all duration-300 backdrop-blur-sm group-hover:border-slate-500"
                        placeholder="Enter your email or username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-2">
                    <label
                      htmlFor="login-password"
                      className="text-sm font-medium text-slate-100 flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Password
                    </label>
                    <div className="relative group">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={loginForm.password}
                        onChange={(e) =>
                          setLoginForm({
                            ...loginForm,
                            password: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-slate-900/75 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400/70 focus:bg-slate-900 transition-all duration-300 backdrop-blur-sm group-hover:border-slate-500 pr-12"
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Login button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 px-6 bg-linear-to-r from-blue-500 to-teal-500 text-white rounded-xl font-semibold shadow-xl shadow-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/60 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    <span>
                      {loading ? "Signing in..." : "Login to Dashboard"}
                    </span>
                    <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer text - at the very bottom */}
      <footer className="py-4 shrink-0">
        <p className="text-center text-slate-300/75 text-sm">
          © {currentYear} Smart City Admin. Secure & Intelligent Infrastructure
          Management
        </p>
      </footer>
    </div>
  );
}

export default LoginPage;
