import { useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Building2,
  Sparkles,
} from "lucide-react";

function SignupPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Signup:", signupForm);
    // Redirect to dashboard after signup
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
            <h2 className="text-2xl font-bold text-white mb-2">
              Create Account
            </h2>
            <p className="text-blue-200/70 text-sm">
              Join us to manage your smart city
            </p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignupSubmit} className="space-y-5">
            {/* Name field */}
            <div className="space-y-2">
              <label
                htmlFor="signup-name"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Full Name
              </label>
              <div className="relative group">
                <input
                  id="signup-name"
                  type="text"
                  value={signupForm.name}
                  onChange={(e) =>
                    setSignupForm({ ...signupForm, name: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            {/* Email field */}
            <div className="space-y-2">
              <label
                htmlFor="signup-email"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Email Address
              </label>
              <div className="relative group">
                <input
                  id="signup-email"
                  type="email"
                  value={signupForm.email}
                  onChange={(e) =>
                    setSignupForm({ ...signupForm, email: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20"
                  placeholder="Enter your email address"
                  required
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label
                htmlFor="signup-password"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Password
              </label>
              <div className="relative group">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  value={signupForm.password}
                  onChange={(e) =>
                    setSignupForm({ ...signupForm, password: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20 pr-12"
                  placeholder="Create a password"
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

            {/* Confirm Password field */}
            <div className="space-y-2">
              <label
                htmlFor="signup-confirm-password"
                className="text-sm font-medium text-blue-100 flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Confirm Password
              </label>
              <div className="relative group">
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={signupForm.confirmPassword}
                  onChange={(e) =>
                    setSignupForm({
                      ...signupForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-blue-200/50 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all duration-300 backdrop-blur-sm group-hover:border-white/20 pr-12"
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-200/70 hover:text-white transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Sign up button */}
            <button
              type="submit"
              className="w-full py-4 px-6 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-xl font-semibold shadow-xl shadow-teal-500/50 hover:shadow-2xl hover:shadow-teal-500/60 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 group mt-6"
            >
              <span>Create Account</span>
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

          {/* Login link */}
          <div className="text-center text-sm text-blue-200/70">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-teal-300 hover:text-teal-200 font-medium transition-colors"
            >
              Sign in
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

export default SignupPage;
