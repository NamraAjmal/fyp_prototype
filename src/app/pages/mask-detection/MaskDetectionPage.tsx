// import { useEffect, useState } from "react";
// import { Link } from "react-router";
// import { Camera, BarChart3, ArrowRight } from "lucide-react";
// import { fetchMaskSummary, type MaskSummary } from "../../services/maskApi";

// function MaskDetectionPage() {
//   const [summary, setSummary] = useState<MaskSummary>({
//     total_detections: 0,
//     compliant: 0,
//     non_compliant: 0,
//     no_person_detections: 0,
//     avg_confidence: 0,
//     compliance_rate: 0,
//   });

//   useEffect(() => {
//     const loadSummary = async () => {
//       try {
//         const data = await fetchMaskSummary();
//         setSummary(data);
//       } catch {
//         // Keep defaults if backend is unavailable.
//       }
//     };

//     loadSummary();
//   }, []);

//   const features = [
//     {
//       title: "Image/Capture",
//       description: "Upload images or capture live video for mask detection",
//       icon: Camera,
//       path: "/dashboard/mask-detection/capture",
//       color: "from-teal-500 to-green-500",
//     },
//     {
//       title: "Logs & Analytics",
//       description: "View detection logs, statistics, and compliance reports",
//       icon: BarChart3,
//       path: "/dashboard/mask-detection/logs",
//       color: "from-purple-500 to-blue-500",
//     },
//   ];

//   return (
//     <div className="space-y-8">
//       <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
//         <h1 className="text-3xl font-bold text-slate-800 mb-2">
//           Mask Detection System
//         </h1>
//         <p className="text-slate-600">
//           Track face mask usage and public health compliance monitoring
//         </p>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//         {features.map((feature) => (
//           <Link
//             key={feature.title}
//             to={feature.path}
//             className="group relative bg-white rounded-xl p-6 shadow-md border border-slate-200/50 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
//           >
//             <div
//               className={`absolute inset-0 bg-linear-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity`}
//             ></div>

//             <div className="relative z-10">
//               <div
//                 className={`inline-flex p-3 rounded-xl bg-linear-to-br ${feature.color} mb-4 shadow-lg`}
//               >
//                 <feature.icon className="w-6 h-6 text-white" />
//               </div>
//               <h3 className="text-xl font-bold text-slate-800 mb-2">
//                 {feature.title}
//               </h3>
//               <p className="text-slate-600 text-sm mb-4">
//                 {feature.description}
//               </p>
//               <div className="flex items-center justify-between text-sm font-medium text-blue-600 group-hover:text-blue-700">
//                 <span>Open</span>
//                 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
//               </div>
//             </div>
//           </Link>
//         ))}
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//         <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
//           <h3 className="text-sm font-medium text-slate-500 mb-2">
//             Total Detections
//           </h3>
//           <p className="text-3xl font-bold text-slate-800">
//             {summary.total_detections}
//           </p>
//           <p className="text-sm text-green-600 mt-1">From mask logs API</p>
//         </div>
//         <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
//           <h3 className="text-sm font-medium text-slate-500 mb-2">
//             Compliance Rate
//           </h3>
//           <p className="text-3xl font-bold text-slate-800">
//             {Number(summary.compliance_rate || 0).toFixed(1)}%
//           </p>
//           <p className="text-sm text-blue-600 mt-1">
//             {summary.compliant} compliant
//           </p>
//         </div>
//         <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
//           <h3 className="text-sm font-medium text-slate-500 mb-2">
//             Violations Today
//           </h3>
//           <p className="text-3xl font-bold text-slate-800">
//             {summary.non_compliant}
//           </p>
//           <p className="text-sm text-yellow-600 mt-1">Needs attention</p>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default MaskDetectionPage;
