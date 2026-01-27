import { Link } from "react-router";
import { UserPlus, Users, Camera, BarChart3, ArrowRight } from "lucide-react";

function FaceDetectionPage() {
  const features = [
    {
      title: "Resident Enrollment",
      description:
        "Add new residents with biometric data and personal information",
      icon: UserPlus,
      path: "/dashboard/face-detection/enrollment",
      color: "from-blue-500 to-cyan-500",
    },
    {
      title: "Resident Directory",
      description: "View, search, and manage all enrolled residents",
      icon: Users,
      path: "/dashboard/face-detection/directory",
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "Image/Capture",
      description: "Upload images or capture live video for facial recognition",
      icon: Camera,
      path: "/dashboard/face-detection/capture",
      color: "from-green-500 to-teal-500",
    },
    {
      title: "Logs & Analytics",
      description: "View detection logs, statistics, and generate reports",
      icon: BarChart3,
      path: "/dashboard/face-detection/logs",
      color: "from-orange-500 to-red-500",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Face Detection System
        </h1>
        <p className="text-slate-600">
          Advanced facial recognition for resident management and security
          monitoring
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
            {/* Background Gradient */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity`}
            ></div>

            <div className="relative z-10">
              {/* Icon */}
              <div
                className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg`}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-slate-600 text-sm mb-4">
                {feature.description}
              </p>

              {/* Action */}
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
            Total Residents
          </h3>
          <p className="text-3xl font-bold text-slate-800">1,245</p>
          <p className="text-sm text-green-600 mt-1">+15 this week</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Detections Today
          </h3>
          <p className="text-3xl font-bold text-slate-800">89</p>
          <p className="text-sm text-blue-600 mt-1">Last: 5 mins ago</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Success Rate
          </h3>
          <p className="text-3xl font-bold text-slate-800">98.7%</p>
          <p className="text-sm text-slate-600 mt-1">+0.3% from yesterday</p>
        </div>
      </div>
    </div>
  );
}

export default FaceDetectionPage;
