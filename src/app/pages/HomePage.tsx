import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Scan,
  HardHat,
  Shield,
  Users,
  Activity,
  ArrowRight,
} from "lucide-react";
import {
  fetchDashboardOverview,
  type DashboardOverview,
} from "../services/dashboardApi";

const initialOverview: DashboardOverview = {
  residentsTotal: 0,
  activeResidents: 0,
  totalImages: 0,
  totalFacesDetected: 0,
  enrollmentsToday: 0,
  helmetDetectionsTotal: 0,
  helmetDetectionsToday: 0,
  maskDetectionsTotal: 0,
  maskDetectionsToday: 0,
  safetyDetectionsTotal: 0,
  safetyDetectionsToday: 0,
  recentActivity: [],
};

function HomePage() {
  const [overview, setOverview] = useState<DashboardOverview>(initialOverview);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchDashboardOverview()
      .then((data) => {
        if (active) {
          setOverview(data);
        }
      })
      .catch(() => {
        if (active) {
          setOverview(initialOverview);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const modules = [
    {
      id: "face-detection",
      title: "Face Recognition",
      description:
        "Open the hub for enrollment, directory search, captures, and logs",
      icon: Scan,
      color: "from-blue-500 to-cyan-500",
      path: "/dashboard/face-detection",
      stats: {
        total: overview.residentsTotal,
        today: overview.enrollmentsToday,
      },
    },
    {
      id: "helmet-detection",
      title: "Helmet Detection",
      description: "Monitor construction site safety and helmet compliance",
      icon: HardHat,
      color: "from-orange-500 to-red-500",
      path: "/dashboard/helmet-detection",
      stats: {
        total: overview.helmetDetectionsTotal,
        today: overview.helmetDetectionsToday,
      },
    },
    {
      id: "mask-detection",
      title: "Mask Detection",
      description: "Track face mask usage and public health compliance",
      icon: Shield,
      color: "from-teal-500 to-green-500",
      path: "/dashboard/mask-detection",
      stats: {
        total: overview.maskDetectionsTotal,
        today: overview.maskDetectionsToday,
      },
    },
  ];

  const quickStats = [
    {
      label: "Total Residents",
      value: loading ? "Loading..." : overview.residentsTotal.toLocaleString(),
      icon: Users,
      change: loading ? "Syncing data" : `${overview.activeResidents} active`,
    },
    {
      label: "Faces Stored",
      value: loading ? "Loading..." : overview.totalImages.toLocaleString(),
      icon: Scan,
      change: loading
        ? "Syncing data"
        : `${overview.totalFacesDetected} encodings`,
    },
    {
      label: "Safety Detections",
      value: loading
        ? "Loading..."
        : overview.safetyDetectionsTotal.toLocaleString(),
      icon: Activity,
      change: loading
        ? "Syncing data"
        : `${overview.safetyDetectionsToday} today`,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-teal-600 p-8 shadow-xl">
        <div className="absolute inset-0 bg-grid-white/10"></div>
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Welcome, Admin 👋
          </h1>
          <p className="text-blue-100 max-w-2xl">
            Manage your smart city infrastructure with AI-powered detection
            systems. Track face recognition, helmet compliance, and mask usage
            in real-time.
          </p>
        </div>
        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute right-20 bottom-0 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl"></div>
      </div>

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
              <div
                className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-10 transition-opacity`}
              ></div>

              <div className="relative z-10">
                <div
                  className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${module.color} mb-4 shadow-lg`}
                >
                  <module.icon className="w-8 h-8 text-white" />
                </div>

                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {module.title}
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  {module.description}
                </p>

                <div className="flex items-center justify-between mb-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Total Detections</p>
                    <p className="text-lg font-bold text-slate-800">
                      {module.stats.total.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Today</p>
                    <p className="text-lg font-bold text-blue-600">
                      {module.stats.today.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  <span>Open Module</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {overview.recentActivity.length > 0 ? (
            overview.recentActivity.map((activity, index) => (
              <div
                key={`${activity.type}-${index}`}
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
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No live activity found yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
