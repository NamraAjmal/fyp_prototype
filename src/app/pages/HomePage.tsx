import { Link } from "react-router";
import {
  Scan,
  HardHat,
  Shield,
  TrendingUp,
  Users,
  Activity,
  ArrowRight,
} from "lucide-react";

function HomePage() {
  const modules = [
    {
      id: "face-detection",
      title: "Face Detection",
      description:
        "Manage resident enrollment and facial recognition monitoring",
      icon: Scan,
      color: "from-blue-500 to-cyan-500",
      path: "/dashboard/face-detection",
      stats: { total: 1245, today: 89 },
    },
    {
      id: "helmet-detection",
      title: "Helmet Detection",
      description: "Monitor construction site safety and helmet compliance",
      icon: HardHat,
      color: "from-orange-500 to-red-500",
      path: "/dashboard/helmet-detection",
      stats: { total: 856, today: 42 },
    },
    {
      id: "mask-detection",
      title: "Mask Detection",
      description: "Track face mask usage and public health compliance",
      icon: Shield,
      color: "from-teal-500 to-green-500",
      path: "/dashboard/mask-detection",
      stats: { total: 2134, today: 167 },
    },
  ];

  const quickStats = [
    {
      label: "Total Detections",
      value: "4,235",
      icon: Activity,
      change: "+12.5%",
    },
    { label: "Active Users", value: "2,156", icon: Users, change: "+8.2%" },
    {
      label: "System Uptime",
      value: "99.9%",
      icon: TrendingUp,
      change: "+0.1%",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-teal-600 p-8 shadow-xl">
        <div className="absolute inset-0 bg-grid-white/10"></div>
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Welcome, Admin 👋
          </h1>
          <p className="text-blue-100 max-w-2xl">
            Manage your smart city infrastructure with AI-powered detection
            systems. Monitor face recognition, helmet compliance, and mask usage
            in real-time.
          </p>
        </div>
        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute right-20 bottom-0 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50">
                <stat.icon className="w-6 h-6 text-slate-700" />
              </div>
              <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                {stat.change}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-1">
              {stat.value}
            </h3>
            <p className="text-sm text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Detection Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link
              key={module.id}
              to={module.path}
              className="group relative bg-white rounded-2xl p-6 shadow-md border border-slate-200/50 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
            >
              {/* Background Gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-10 transition-opacity`}
              ></div>

              <div className="relative z-10">
                {/* Icon */}
                <div
                  className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${module.color} mb-4 shadow-lg`}
                >
                  <module.icon className="w-8 h-8 text-white" />
                </div>

                {/* Title and Description */}
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {module.title}
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  {module.description}
                </p>

                {/* Stats */}
                <div className="flex items-center justify-between mb-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Total Detections</p>
                    <p className="text-lg font-bold text-slate-800">
                      {module.stats.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Today</p>
                    <p className="text-lg font-bold text-blue-600">
                      {module.stats.today}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex items-center justify-between text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  <span>Open Module</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity Section (Placeholder) */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {[
            {
              type: "Face Detection",
              message: "New resident enrolled: John Doe",
              time: "5 minutes ago",
            },
            {
              type: "Helmet Detection",
              message: "Safety compliance alert at Site B",
              time: "23 minutes ago",
            },
            {
              type: "Mask Detection",
              message: "Daily report generated successfully",
              time: "1 hour ago",
            },
            {
              type: "Face Detection",
              message: "System updated with 15 new entries",
              time: "2 hours ago",
            },
          ].map((activity, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {activity.type}
                </p>
                <p className="text-sm text-slate-600">{activity.message}</p>
                <p className="text-xs text-slate-400 mt-1">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
