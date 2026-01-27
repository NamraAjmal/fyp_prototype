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

const lineChartData = [
  { date: "Mon", detections: 112 },
  { date: "Tue", detections: 134 },
  { date: "Wed", detections: 98 },
  { date: "Thu", detections: 145 },
  { date: "Fri", detections: 127 },
  { date: "Sat", detections: 89 },
  { date: "Sun", detections: 76 },
];

const barChartData = [
  { hour: "06:00", count: 45 },
  { hour: "09:00", count: 78 },
  { hour: "12:00", count: 92 },
  { hour: "15:00", count: 67 },
  { hour: "18:00", count: 43 },
  { hour: "21:00", count: 12 },
];

const pieChartData = [
  { name: "Compliant", value: 806 },
  { name: "Violations", value: 50 },
];

const COLORS = ["#10b981", "#ef4444"];

const mockLogs = [
  {
    id: 1,
    timestamp: "2026-01-25 16:45:22",
    location: "Site A - Zone 1",
    persons: 4,
    helmets: 4,
    status: "Compliant",
    confidence: 96.3,
  },
  {
    id: 2,
    timestamp: "2026-01-25 16:32:18",
    location: "Site B - Zone 2",
    persons: 3,
    helmets: 2,
    status: "Violation",
    confidence: 92.7,
  },
  {
    id: 3,
    timestamp: "2026-01-25 16:18:45",
    location: "Site A - Zone 3",
    persons: 2,
    helmets: 2,
    status: "Compliant",
    confidence: 94.5,
  },
  {
    id: 4,
    timestamp: "2026-01-25 16:05:33",
    location: "Site C - Zone 1",
    persons: 5,
    helmets: 5,
    status: "Compliant",
    confidence: 98.1,
  },
  {
    id: 5,
    timestamp: "2026-01-25 15:52:09",
    location: "Site A - Zone 2",
    persons: 3,
    helmets: 3,
    status: "Compliant",
    confidence: 95.8,
  },
  {
    id: 6,
    timestamp: "2026-01-25 15:38:27",
    location: "Site B - Zone 1",
    persons: 4,
    helmets: 3,
    status: "Violation",
    confidence: 89.4,
  },
  {
    id: 7,
    timestamp: "2026-01-25 15:24:56",
    location: "Site C - Zone 2",
    persons: 6,
    helmets: 6,
    status: "Compliant",
    confidence: 97.2,
  },
  {
    id: 8,
    timestamp: "2026-01-25 15:11:14",
    location: "Site A - Zone 1",
    persons: 2,
    helmets: 2,
    status: "Compliant",
    confidence: 93.6,
  },
];

function HelmetLogsAnalyticsPage() {
  const [dateRange, setDateRange] = useState("week");
  const [filterLocation, setFilterLocation] = useState("all");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/helmet-detection"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-800">
            Helmet Detection Logs & Analytics
          </h1>
          <p className="text-slate-600">
            View compliance logs and safety statistics
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
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
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="all">All Sites</option>
              <option value="site-a">Site A</option>
              <option value="site-b">Site B</option>
              <option value="site-c">Site C</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Total Detections
          </h3>
          <p className="text-3xl font-bold text-slate-800">856</p>
          <p className="text-sm text-green-600 mt-1">+8.3% from last week</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Compliance Rate
          </h3>
          <p className="text-3xl font-bold text-slate-800">94.2%</p>
          <p className="text-sm text-blue-600 mt-1">806 compliant</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Violations
          </h3>
          <p className="text-3xl font-bold text-slate-800">50</p>
          <p className="text-sm text-red-600 mt-1">5.8% of total</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Avg. Confidence
          </h3>
          <p className="text-3xl font-bold text-slate-800">94.7%</p>
          <p className="text-sm text-slate-600 mt-1">High accuracy</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                stroke="#f97316"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

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
              <Bar dataKey="count" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Compliance Status
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

        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Quick Summary
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-green-700">
                Compliant
              </span>
              <span className="text-xl font-bold text-green-700">806</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm font-medium text-red-700">
                Violations
              </span>
              <span className="text-xl font-bold text-red-700">50</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <span className="text-sm font-medium text-orange-700">
                Total Workers
              </span>
              <span className="text-xl font-bold text-orange-700">3,421</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-700">
                Active Sites
              </span>
              <span className="text-xl font-bold text-blue-700">12</span>
            </div>
          </div>
        </div>
      </div>

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
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Persons
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Helmets
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Confidence
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                    {log.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.persons}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.helmets}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        log.status === "Compliant"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {log.confidence}%
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

export default HelmetLogsAnalyticsPage;
