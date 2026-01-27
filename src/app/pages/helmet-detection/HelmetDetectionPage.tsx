import { Link } from "react-router";
import { Camera, BarChart3, ArrowRight } from "lucide-react";

function HelmetDetectionPage() {
  const features = [
    {
      title: "Image/Capture",
      description: "Upload images or capture live video for helmet detection",
      icon: Camera,
      path: "/dashboard/helmet-detection/capture",
      color: "from-orange-500 to-red-500",
    },
    {
      title: "Logs & Analytics",
      description: "View detection logs, statistics, and compliance reports",
      icon: BarChart3,
      path: "/dashboard/helmet-detection/logs",
      color: "from-purple-500 to-pink-500",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Helmet Detection System
        </h1>
        <p className="text-slate-600">
          Monitor construction site safety and helmet compliance in real-time
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature) => (
          <Link
            key={feature.title}
            to={feature.path}
            className="group relative bg-white rounded-xl p-6 shadow-md border border-slate-200/50 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity`}
            ></div>

            <div className="relative z-10">
              <div
                className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg`}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-slate-600 text-sm mb-4">
                {feature.description}
              </p>
              <div className="flex items-center justify-between text-sm font-medium text-blue-600 group-hover:text-blue-700">
                <span>Open</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Total Detections
          </h3>
          <p className="text-3xl font-bold text-slate-800">856</p>
          <p className="text-sm text-green-600 mt-1">+8 this week</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Compliance Rate
          </h3>
          <p className="text-3xl font-bold text-slate-800">94.2%</p>
          <p className="text-sm text-blue-600 mt-1">+2.3% improvement</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Violations Today
          </h3>
          <p className="text-3xl font-bold text-slate-800">12</p>
          <p className="text-sm text-red-600 mt-1">Requires attention</p>
        </div>
      </div>
    </div>
  );
}

export default HelmetDetectionPage;
