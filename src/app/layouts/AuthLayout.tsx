import { Outlet } from "react-router";

const AuthLayout = () => {
  return (
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4 text-slate-900">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-linear-to-br from-slate-100 via-blue-100 to-teal-100">
        {/* Animated overlay gradients */}
        <div
          className="absolute inset-0 bg-linear-to-tr from-blue-500/20 via-transparent to-teal-500/20 animate-pulse"
          style={{ animationDuration: "8s" }}
        ></div>
        <div
          className="absolute inset-0 bg-linear-to-bl from-cyan-500/15 via-transparent to-blue-500/15"
          style={{ animation: "pulse 6s ease-in-out infinite" }}
        ></div>
      </div>

      {/* Smart city background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56, 189, 248, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.3) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        ></div>

        {/* Floating orbs */}
        <div
          className="absolute top-20 left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "4s" }}
        ></div>
        <div
          className="absolute bottom-20 right-20 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "5s", animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "6s", animationDelay: "2s" }}
        ></div>

        {/* Abstract city skyline */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-30">
          <div className="absolute bottom-0 left-[10%] w-16 h-24 bg-linear-to-t from-blue-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[20%] w-12 h-32 bg-linear-to-t from-teal-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[30%] w-20 h-20 bg-linear-to-t from-cyan-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[45%] w-14 h-28 bg-linear-to-t from-blue-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[55%] w-16 h-24 bg-linear-to-t from-teal-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[65%] w-10 h-20 bg-linear-to-t from-cyan-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[75%] w-18 h-32 bg-linear-to-t from-blue-400/40 to-transparent"></div>
          <div className="absolute bottom-0 left-[85%] w-12 h-24 bg-linear-to-t from-teal-400/40 to-transparent"></div>
        </div>
      </div>

      {/* Content outlet */}
      <div className="relative z-10 w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
