import { useState } from "react";
import { ArrowLeft, Download, Calendar, Filter } from "lucide-react";
import { Link } from "react-router";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Mock data
const lineChartData = [
  { date: "Mon", detections: 65 },
  { date: "Tue", detections: 89 },
  { date: "Wed", detections: 73 },
  { date: "Thu", detections: 95 },
  { date: "Fri", detections: 82 },
  { date: "Sat", detections: 91 },
  { date: "Sun", detections: 78 },
];

const barChartData = [
  { hour: "00:00", count: 12 },
  { hour: "04:00", count: 8 },
  { hour: "08:00", count: 45 },
  { hour: "12:00", count: 78 },
  { hour: "16:00", count: 62 },
  { hour: "20:00", count: 34 },
];

const pieChartData = [
  { name: "Matched", value: 873 },
  { name: "Unknown", value: 127 },
  { name: "Failed", value: 45 },
];

const COLORS = ["#10b981", "#f59e0b", "#ef4444"];

const mockLogs = [
  {
    id: 1,
    timestamp: "2026-01-25 14:32:15",
    name: "John Doe",
    confidence: 95.7,
    status: "Matched",
    location: "Main Gate",
  },
  {
    id: 2,
    timestamp: "2026-01-25 14:28:42",
    name: "Jane Smith",
    confidence: 92.3,
    status: "Matched",
    location: "Building A",
  },
  {
    id: 3,
    timestamp: "2026-01-25 14:15:33",
    name: "Unknown",
    confidence: 68.5,
    status: "Unknown",
    location: "Parking Lot",
  },
  {
    id: 4,
    timestamp: "2026-01-25 14:10:17",
    name: "Mike Johnson",
    confidence: 97.2,
    status: "Matched",
    location: "Reception",
  },
  {
    id: 5,
    timestamp: "2026-01-25 13:55:28",
    name: "Unknown",
    confidence: 54.3,
    status: "Unknown",
    location: "Side Entrance",
  },
  {
    id: 6,
    timestamp: "2026-01-25 13:42:09",
    name: "Sarah Williams",
    confidence: 94.8,
    status: "Matched",
    location: "Main Gate",
  },
  {
    id: 7,
    timestamp: "2026-01-25 13:31:45",
    name: "David Brown",
    confidence: 89.6,
    status: "Matched",
    location: "Building B",
  },
  {
    id: 8,
    timestamp: "2026-01-25 13:18:52",
    name: "Error",
    confidence: 0,
    status: "Failed",
    location: "Main Gate",
  },
];

function FaceLogsAnalyticsPage() {
  const [dateRange, setDateRange] = useState("week");
  const [filterLocation, setFilterLocation] = useState("all");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/face-detection"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-800">
            Logs & Analytics
          </h1>
          <p className="text-slate-600">
            View detection logs and system statistics
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Locations</option>
              <option value="main-gate">Main Gate</option>
              <option value="building-a">Building A</option>
              <option value="building-b">Building B</option>
              <option value="reception">Reception</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Total Detections
          </h3>
          <p className="text-3xl font-bold text-slate-800">1,045</p>
          <p className="text-sm text-green-600 mt-1">+12.5% from last week</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Matched Faces
          </h3>
          <p className="text-3xl font-bold text-slate-800">873</p>
          <p className="text-sm text-blue-600 mt-1">83.5% success rate</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Unknown Faces
          </h3>
          <p className="text-3xl font-bold text-slate-800">127</p>
          <p className="text-sm text-yellow-600 mt-1">12.2% of total</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Avg. Confidence
          </h3>
          <p className="text-3xl font-bold text-slate-800">92.3%</p>
          <p className="text-sm text-slate-600 mt-1">+2.1% improvement</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart - Detection Trend */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Detection Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="detections"
                stroke="#3b82f6"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart - Hourly Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Hourly Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - Detection Status */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Detection Status
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Summary */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Quick Summary
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-green-700">
                Matched Detections
              </span>
              <span className="text-xl font-bold text-green-700">873</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm font-medium text-yellow-700">
                Unknown Detections
              </span>
              <span className="text-xl font-bold text-yellow-700">127</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm font-medium text-red-700">
                Failed Detections
              </span>
              <span className="text-xl font-bold text-red-700">45</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-700">
                Total Processed
              </span>
              <span className="text-xl font-bold text-blue-700">1,045</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">
            Recent Detection Logs
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {mockLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.timestamp}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {log.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.confidence > 0 ? `${log.confidence}%` : "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        log.status === "Matched"
                          ? "bg-green-100 text-green-700"
                          : log.status === "Unknown"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default FaceLogsAnalyticsPage;
