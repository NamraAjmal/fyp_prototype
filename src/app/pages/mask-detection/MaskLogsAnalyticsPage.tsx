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
  { date: "Mon", detections: 289 },
  { date: "Tue", detections: 312 },
  { date: "Wed", detections: 267 },
  { date: "Thu", detections: 334 },
  { date: "Fri", detections: 298 },
  { date: "Sat", detections: 276 },
  { date: "Sun", detections: 245 },
];

const barChartData = [
  { hour: "08:00", count: 78 },
  { hour: "10:00", count: 124 },
  { hour: "12:00", count: 156 },
  { hour: "14:00", count: 143 },
  { hour: "16:00", count: 98 },
  { hour: "18:00", count: 67 },
];

const pieChartData = [
  { name: "With Mask", value: 1912 },
  { name: "Without Mask", value: 222 },
];

const COLORS = ["#10b981", "#f59e0b"];

const mockLogs = [
  {
    id: 1,
    timestamp: "2026-01-25 17:23:45",
    location: "Shopping Mall - Entrance",
    persons: 8,
    masked: 7,
    status: "Compliant",
    confidence: 94.2,
  },
  {
    id: 2,
    timestamp: "2026-01-25 17:18:32",
    location: "Office Building - Lobby",
    persons: 5,
    masked: 4,
    status: "Non-Compliant",
    confidence: 91.8,
  },
  {
    id: 3,
    timestamp: "2026-01-25 17:12:19",
    location: "Hospital - Main Entrance",
    persons: 12,
    masked: 12,
    status: "Compliant",
    confidence: 97.5,
  },
  {
    id: 4,
    timestamp: "2026-01-25 17:05:47",
    location: "Shopping Mall - Food Court",
    persons: 15,
    masked: 13,
    status: "Non-Compliant",
    confidence: 89.3,
  },
  {
    id: 5,
    timestamp: "2026-01-25 16:58:26",
    location: "Metro Station - Platform",
    persons: 23,
    masked: 21,
    status: "Compliant",
    confidence: 95.7,
  },
  {
    id: 6,
    timestamp: "2026-01-25 16:51:13",
    location: "Office Building - Reception",
    persons: 6,
    masked: 6,
    status: "Compliant",
    confidence: 92.4,
  },
  {
    id: 7,
    timestamp: "2026-01-25 16:43:58",
    location: "Shopping Mall - Parking",
    persons: 4,
    masked: 3,
    status: "Non-Compliant",
    confidence: 88.6,
  },
  {
    id: 8,
    timestamp: "2026-01-25 16:36:41",
    location: "Hospital - Emergency",
    persons: 9,
    masked: 9,
    status: "Compliant",
    confidence: 96.1,
  },
];

function MaskLogsAnalyticsPage() {
  const [dateRange, setDateRange] = useState("week");
  const [filterLocation, setFilterLocation] = useState("all");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/mask-detection"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-800">
            Mask Detection Logs & Analytics
          </h1>
          <p className="text-slate-600">
            View mask compliance logs and health safety statistics
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-green-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
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
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
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
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="all">All Locations</option>
              <option value="mall">Shopping Malls</option>
              <option value="office">Office Buildings</option>
              <option value="hospital">Hospitals</option>
              <option value="metro">Metro Stations</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Total Detections
          </h3>
          <p className="text-3xl font-bold text-slate-800">2,134</p>
          <p className="text-sm text-green-600 mt-1">+11.2% from last week</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Compliance Rate
          </h3>
          <p className="text-3xl font-bold text-slate-800">89.6%</p>
          <p className="text-sm text-blue-600 mt-1">1,912 masked</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Non-Compliant
          </h3>
          <p className="text-3xl font-bold text-slate-800">222</p>
          <p className="text-sm text-yellow-600 mt-1">10.4% of total</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-sm font-medium text-slate-500 mb-2">
            Avg. Confidence
          </h3>
          <p className="text-3xl font-bold text-slate-800">93.2%</p>
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
                stroke="#14b8a6"
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
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Mask Compliance
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
                With Mask
              </span>
              <span className="text-xl font-bold text-green-700">1,912</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm font-medium text-yellow-700">
                Without Mask
              </span>
              <span className="text-xl font-bold text-yellow-700">222</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-teal-50 rounded-lg">
              <span className="text-sm font-medium text-teal-700">
                Total Locations
              </span>
              <span className="text-xl font-bold text-teal-700">48</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-700">
                Active Cameras
              </span>
              <span className="text-xl font-bold text-blue-700">87</span>
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
                  Masked
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
                    {log.masked}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        log.status === "Compliant"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
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

export default MaskLogsAnalyticsPage;
