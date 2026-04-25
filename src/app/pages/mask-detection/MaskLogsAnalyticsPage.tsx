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
  fetchMaskLogs,
  type MaskLog,
  type MaskSummary,
} from "../../services/maskApi";

const COLORS = ["#10b981", "#ef4444", "#f59e0b"];

function toDate(log: MaskLog) {
  return new Date(log.timestamp.replace(" ", "T"));
}

function inSelectedRange(date: Date, range: string) {
  const now = new Date();
  if (range === "today") return date.toDateString() === now.toDateString();
  if (range === "week") {
    const w = new Date(now);
    w.setDate(now.getDate() - 7);
    return date >= w;
  }
  if (range === "month") {
    const m = new Date(now);
    m.setMonth(now.getMonth() - 1);
    return date >= m;
  }
  return true;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function ImageLightbox({
  src,
  log,
  onClose,
}: {
  src: string;
  log: MaskLog;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
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
        {/* Header */}
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

        {/* Annotated image */}
        <img
          src={src}
          alt="Annotated detection"
          className="w-full object-contain max-h-[60vh]"
        />

        {/* Stats */}
        <div className="grid grid-cols-4 divide-x divide-slate-200 border-t border-slate-200">
          {[
            { label: "Persons", value: log.persons },
            { label: "Masked", value: log.masked },
            {
              label: "Violations",
              value: (log.without_mask ?? 0) + (log.incorrect ?? 0),
            },
            {
              label: "Confidence",
              value: `${Number(log.confidence).toFixed(1)}%`,
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

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Compliant"
      ? "bg-green-100 text-green-700"
      : status === "Non-Compliant"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${cls}`}
    >
      {status}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function MaskLogsAnalyticsPage() {
  const [dateRange, setDateRange] = useState("week");
  const [statusFilter, setStatusFilter] = useState("all");
  const [logs, setLogs] = useState<MaskLog[]>([]);
  const [summary, setSummary] = useState<MaskSummary>({
    total_detections: 0,
    compliant: 0,
    non_compliant: 0,
    no_person_detections: 0,
    avg_confidence: 0,
    compliance_rate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lightbox, setLightbox] = useState<{
    src: string;
    log: MaskLog;
  } | null>(null);

  const startTime = useMemo(() => {
    const now = new Date();
    const map: Record<string, () => Date> = {
      today: () => {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      },
      week: () => {
        const d = new Date(now);
        d.setDate(now.getDate() - 7);
        return d;
      },
      month: () => {
        const d = new Date(now);
        d.setMonth(now.getMonth() - 1);
        return d;
      },
      year: () => {
        const d = new Date(now);
        d.setFullYear(now.getFullYear() - 1);
        return d;
      },
    };
    return map[dateRange]?.().toISOString();
  }, [dateRange]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const payload = await fetchMaskLogs({
          page: 1,
          pageSize: 1000,
          status: statusFilter,
          startTime,
        });
        setLogs(payload.logs || []);
        setSummary(payload.summary);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load logs"
        );
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [statusFilter, startTime, refreshKey]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const d = toDate(log);
        return !Number.isNaN(d.getTime()) && inSelectedRange(d, dateRange);
      }),
    [logs, dateRange]
  );

  const lineChartData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const count: Record<string, number> = Object.fromEntries(
      days.map((d) => [d, 0])
    );
    filteredLogs.forEach((l) => {
      const d = toDate(l);
      if (!isNaN(d.getTime())) count[days[d.getDay()]]++;
    });
    return days.map((day) => ({ date: day, detections: count[day] }));
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
    filteredLogs.forEach((l) => {
      const d = toDate(l);
      if (isNaN(d.getTime())) return;
      const b = buckets.find(
        (b) => d.getHours() >= b.min && d.getHours() < b.max
      );
      if (b) b.count++;
    });
    return buckets.map(({ hour, count }) => ({ hour, count }));
  }, [filteredLogs]);

  const pieChartData = useMemo(
    () => [
      { name: "With Mask", value: summary.compliant },
      { name: "Without Mask", value: summary.non_compliant },
      { name: "No Person", value: summary.no_person_detections },
    ],
    [summary]
  );

  const exportCsv = () => {
    const rows = [
      [
        "Timestamp",
        "Persons",
        "Masked",
        "Without Mask",
        "Incorrect",
        "Status",
        "Confidence",
      ],
      ...filteredLogs.map((l) => [
        l.timestamp,
        l.persons,
        l.masked,
        l.without_mask ?? 0,
        l.incorrect ?? 0,
        l.status,
        l.confidence,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mask_logs_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/mask-detection"
            className="p-2 rounded-lg hover:bg-slate-100"
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
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-green-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
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
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500"
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
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500"
              >
                <option value="all">All Statuses</option>
                <option value="Compliant">Compliant</option>
                <option value="Non-Compliant">Non-Compliant</option>
                <option value="No Persons Detected">No Persons Detected</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl p-10 shadow-md border border-slate-200/50 flex items-center justify-center gap-3 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading mask analytics…
          </div>
        ) : errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            {errorMessage}
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  label: "Total Detections",
                  value: summary.total_detections,
                  sub: "Filtered results",
                  color: "text-slate-800",
                },
                {
                  label: "Compliance Rate",
                  value: `${Number(summary.compliance_rate).toFixed(1)}%`,
                  sub: `${summary.compliant} with mask`,
                  color: "text-slate-800",
                },
                {
                  label: "Non-Compliant",
                  value: summary.non_compliant,
                  sub: "Needs attention",
                  color: "text-red-600",
                },
                {
                  label: "Avg. Confidence",
                  value: `${Number(summary.avg_confidence).toFixed(1)}%`,
                  sub: "Avg. detection confidence",
                  color: "text-slate-800",
                },
              ].map(({ label, value, sub, color }) => (
                <div
                  key={label}
                  className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50"
                >
                  <h3 className="text-sm font-medium text-slate-500 mb-2">
                    {label}
                  </h3>
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-sm text-slate-500 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  Detection Trend
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
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
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  Mask Compliance Breakdown
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={90}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={COLORS[i % COLORS.length]}
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
                <div className="space-y-3">
                  {[
                    {
                      label: "With Mask",
                      value: summary.compliant,
                      bg: "bg-green-50",
                      text: "text-green-700",
                    },
                    {
                      label: "Without Mask",
                      value: summary.non_compliant,
                      bg: "bg-red-50",
                      text: "text-red-700",
                    },
                    {
                      label: "Total Persons Detected",
                      value: filteredLogs.reduce(
                        (s, l) => s + Number(l.persons || 0),
                        0
                      ),
                      bg: "bg-teal-50",
                      text: "text-teal-700",
                    },
                    {
                      label: "Active Cameras",
                      value: new Set(
                        filteredLogs
                          .map((l) => (l.camera_id || "").trim())
                          .filter(Boolean)
                      ).size,
                      bg: "bg-blue-50",
                      text: "text-blue-700",
                    },
                  ].map(({ label, value, bg, text }) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between p-3 ${bg} rounded-lg`}
                    >
                      <span className={`text-sm font-medium ${text}`}>
                        {label}
                      </span>
                      <span className={`text-xl font-bold ${text}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Logs table with annotated thumbnails */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800">
                  Recent Detection Logs
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    — click thumbnail to view annotated frame
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Persons
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Masked
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Violations
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.map((log, idx) => (
                      <tr
                        key={`${log.id}-${idx}`}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        {/* Thumbnail */}
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
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                          {log.persons}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-700 font-medium">
                          {log.masked}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 font-medium">
                          {(log.without_mask ?? 0) + (log.incorrect ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {Number(log.confidence).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
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

export default MaskLogsAnalyticsPage;
