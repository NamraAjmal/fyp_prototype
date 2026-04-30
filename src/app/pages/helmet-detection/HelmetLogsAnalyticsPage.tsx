import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  Calendar,
  Filter,
  Loader2,
  RotateCcw,
  Camera,
  ZoomIn,
  X,
} from "lucide-react";
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
import {
  fetchHelmetLogs,
  type HelmetLog,
  type HelmetSummary,
} from "../../services/helmetApi";
import { hasPremiumAccess } from "../../services/billingApi";

const COLORS = ["#10b981", "#ef4444"];

function inSelectedRange(date: Date, range: string) {
  const now = new Date();

  if (range === "today") {
    return date.toDateString() === now.toDateString();
  }

  if (range === "week") {
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);
    return date >= oneWeekAgo;
  }

  if (range === "month") {
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(now.getMonth() - 1);
    return date >= oneMonthAgo;
  }

  return true;
}

function toDate(log: HelmetLog) {
  return new Date(log.timestamp.replace(" ", "T"));
}

function ImageLightbox({
  src,
  log,
  onClose,
}: {
  src: string;
  log: HelmetLog;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <p className="font-semibold text-slate-800">{log.file_name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{log.timestamp}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <img
          src={src}
          alt="Annotated helmet frame"
          className="w-full object-contain max-h-[60vh]"
        />

        <div className="grid grid-cols-4 divide-x divide-slate-200 border-t border-slate-200">
          {[
            { label: "Persons", value: log.persons },
            { label: "Helmets", value: log.helmets },
            { label: "No Helmet", value: log.no_helmet },
            {
              label: "Confidence",
              value: `${Number(log.confidence || 0).toFixed(1)}%`,
            },
          ].map(({ label, value }) => (
            <div key={label} className="p-4 text-center">
              <p className="text-xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelmetLogsAnalyticsPage() {
  const canExport = hasPremiumAccess();
  const [dateRange, setDateRange] = useState("week");
  const [statusFilter, setStatusFilter] = useState("all");
  const [logs, setLogs] = useState<HelmetLog[]>([]);
  const [summary, setSummary] = useState<HelmetSummary>({
    total_detections: 0,
    compliant: 0,
    violations: 0,
    avg_confidence: 0,
    compliance_rate: 0,
    no_person_detections: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lightbox, setLightbox] = useState<{
    src: string;
    log: HelmetLog;
  } | null>(null);

  const startTime = useMemo(() => {
    const now = new Date();

    if (dateRange === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }

    if (dateRange === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return start.toISOString();
    }

    if (dateRange === "month") {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      return start.toISOString();
    }

    if (dateRange === "year") {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      return start.toISOString();
    }

    return undefined;
  }, [dateRange]);

  useEffect(() => {
    const loadLogs = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const payload = await fetchHelmetLogs({
          page: 1,
          pageSize: 1000,
          status: statusFilter,
          startTime,
        });

        setLogs(payload.logs || []);
        setSummary(payload.summary);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load helmet logs"
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadLogs();
  }, [statusFilter, startTime, refreshKey]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const parsedDate = toDate(log);
      return (
        !Number.isNaN(parsedDate.getTime()) &&
        inSelectedRange(parsedDate, dateRange)
      );
    });
  }, [logs, dateRange]);

  const lineChartData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const countByDay: Record<string, number> = {
      Sun: 0,
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
    };

    filteredLogs.forEach((log) => {
      const date = toDate(log);
      if (!Number.isNaN(date.getTime())) {
        countByDay[days[date.getDay()]] += 1;
      }
    });

    return days.map((day) => ({ date: day, detections: countByDay[day] }));
  }, [filteredLogs]);

  const barChartData = useMemo(() => {
    const buckets = [
      { hour: "00:00", count: 0, min: 0, max: 4 },
      { hour: "04:00", count: 0, min: 4, max: 8 },
      { hour: "08:00", count: 0, min: 8, max: 12 },
      { hour: "12:00", count: 0, min: 12, max: 16 },
      { hour: "16:00", count: 0, min: 16, max: 20 },
      { hour: "20:00", count: 0, min: 20, max: 24 },
    ];

    filteredLogs.forEach((log) => {
      const date = toDate(log);
      if (Number.isNaN(date.getTime())) {
        return;
      }

      const hour = date.getHours();
      const bucket = buckets.find(
        (item) => hour >= item.min && hour < item.max
      );
      if (bucket) {
        bucket.count += 1;
      }
    });

    return buckets.map(({ hour, count }) => ({ hour, count }));
  }, [filteredLogs]);

  const pieChartData = useMemo(
    () => [
      { name: "Compliant", value: summary.compliant },
      { name: "Violations", value: summary.violations },
    ],
    [summary.compliant, summary.violations]
  );

  const exportCsv = () => {
    if (!canExport) {
      setErrorMessage("Exports are available after the organization upgrade.");
      return;
    }

    const rows = [
      ["Timestamp", "Persons", "Helmets", "No Helmet", "Status", "Confidence"],
      ...filteredLogs.map((log) => [
        log.timestamp,
        String(log.persons),
        String(log.helmets),
        String(log.no_helmet),
        log.status,
        String(log.confidence),
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `helmet_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          log={lightbox.log}
          onClose={() => setLightbox(null)}
        />
      )}

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
          <button
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!canExport}
            title={
              canExport ? "Export Report" : "Upgrade required to export reports"
            }
            className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="Compliant">Compliant</option>
                <option value="Violation">Violation</option>
                <option value="No Persons Detected">No Persons Detected</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl p-10 shadow-md border border-slate-200/50 flex items-center justify-center gap-3 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading helmet analytics...
          </div>
        ) : errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            {errorMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Total Detections
                </h3>
                <p className="text-3xl font-bold text-slate-800">
                  {summary.total_detections}
                </p>
                <p className="text-sm text-slate-600 mt-1">Filtered results</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Compliance Rate
                </h3>
                <p className="text-3xl font-bold text-slate-800">
                  {Number(summary.compliance_rate || 0).toFixed(1)}%
                </p>
                <p className="text-sm text-blue-600 mt-1">
                  {summary.compliant} compliant
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Violations
                </h3>
                <p className="text-3xl font-bold text-slate-800">
                  {summary.violations}
                </p>
                <p className="text-sm text-red-600 mt-1">Requires attention</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Avg. Confidence
                </h3>
                <p className="text-3xl font-bold text-slate-800">
                  {Number(summary.avg_confidence || 0).toFixed(1)}%
                </p>
                <p className="text-sm text-slate-600 mt-1">Model confidence</p>
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
                    <YAxis allowDecimals={false} />
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
                    <YAxis allowDecimals={false} />
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
                        `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${entry.name}-${index}`}
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
                    <span className="text-xl font-bold text-green-700">
                      {summary.compliant}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <span className="text-sm font-medium text-red-700">
                      Violations
                    </span>
                    <span className="text-xl font-bold text-red-700">
                      {summary.violations}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-orange-700">
                      Total Workers (Estimated)
                    </span>
                    <span className="text-xl font-bold text-orange-700">
                      {filteredLogs.reduce(
                        (sum, log) => sum + Number(log.persons || 0),
                        0
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium text-slate-700">
                      No Person Detections
                    </span>
                    <span className="text-xl font-bold text-slate-700">
                      {summary.no_person_detections || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800">
                  Recent Detection Logs
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    - click thumbnail to view annotated frame
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-28">
                        Frame
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Timestamp
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
                    {filteredLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          {log.annotated_image ? (
                            <div
                              className="relative group cursor-pointer"
                              onClick={() =>
                                setLightbox({ src: log.annotated_image!, log })
                              }
                            >
                              <img
                                src={log.annotated_image}
                                alt="Detection"
                                className="w-20 h-14 object-cover rounded-lg border border-slate-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                                <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-20 h-14 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Camera className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {log.timestamp}
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
                          {Number(log.confidence || 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-slate-400 text-sm"
                        >
                          No detections found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default HelmetLogsAnalyticsPage;
