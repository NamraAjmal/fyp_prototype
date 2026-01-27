import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Eye, EyeOff, Mail, Lock, Building2, Sparkles } from "lucide-react";

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login:", loginForm);
    // Redirect to dashboard after login
    navigate("/dashboard");
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Logo/Brand */}
      <div className="text-center mb-8 animate-in fade-in slide-in-from-top duration-700">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 mb-4 shadow-xl shadow-blue-500/50">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
          Smart City Admin
        </h1>
        <p className="text-blue-200/80 text-sm">
          Manage your city infrastructure intelligently
        </p>
      </div>

      {/* Glassmorphism card */}
      <div className="relative backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8 animate-in fade-in slide-in-from-bottom duration-700">
        {/* Gradient overlay for extra depth */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 via-transparent to-blue-500/5 pointer-events-none"></div>

        {/* Content */}
        <div className="relative">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-blue-200/70 text-sm">Sign in to your account</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            {/* Email/Username field */}
            <div className="space-y-2">
              <label
                htmlFor="login-email"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Email or Username
              </label>
              <div className="relative group">
                <input
                  id="login-email"
                  type="text"
                  value={loginForm.email}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, email: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20"
                  placeholder="Enter your email or username"
                  required
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label
                htmlFor="login-password"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
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
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20 pr-12"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/70 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm text-teal-300 hover:text-teal-200 transition-colors font-medium"
              >
                Forgot Password?
              </button>
            </div>

            {/* Login button */}
            <button
              type="submit"
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-teal-500 text-white rounded-xl font-semibold shadow-xl shadow-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/60 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 group"
            >
              <span>Login to Dashboard</span>
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-transparent text-blue-200/60">
                or continue with
              </span>
            </div>
          </div>

          {/* Social login buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              className="py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-blue-100 hover:bg-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm font-medium"
            >
              Google
            </button>
            <button
              type="button"
              className="py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-blue-100 hover:bg-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm font-medium"
            >
              Facebook
            </button>
          </div>

          {/* Sign up link */}
          <div className="text-center text-sm text-blue-200/70">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-teal-300 hover:text-teal-200 font-medium transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>

      {/* Footer text */}
      <p className="text-center text-blue-200/60 text-sm mt-6">
        © 2026 Smart City Admin. Secure & Intelligent Infrastructure Management
      </p>
    </div>
  );
}

export default LoginPage;
