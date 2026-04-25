import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  ZoomIn,
  X,
  Sheet,
  FileJson,
  Printer,
  ChevronDown,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

const API_BASE = "http://127.0.0.1:5000";

const COLORS = ["#10b981", "#f59e0b", "#ef4444"];

interface FaceLog {
  id: number;
  timestamp: string;
  name?: string;
  confidence: number;
  status: "Matched" | "Unknown" | "Failed";
  cnic?: string;
  file_name?: string;
  source?: string;
  camera_id?: string;
  annotated_image?: string;
}

interface Summary {
  total_detections: number;
  matched: number;
  unknown: number;
  failed: number;
  avg_confidence: number;
  success_rate: number;
  enrollments_today: number;
}

function ImageLightbox({
  src,
  log,
  onClose,
}: {
  src: string;
  log: FaceLog;
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
            <p className="font-semibold text-slate-800">
              {log.file_name || "face_detection.jpg"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{log.timestamp}</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <img
          src={src}
          alt="Annotated face detection"
          className="w-full object-contain max-h-[60vh]"
        />

        <div className="grid grid-cols-4 divide-x divide-slate-200 border-t border-slate-200">
          {[
            { label: "Status", value: log.status },
            { label: "Name", value: log.name || "Unknown" },
            { label: "CNIC", value: log.cnic || "-" },
            {
              label: "Confidence",
              value:
                Number(log.confidence || 0) > 0
                  ? `${Number(log.confidence || 0).toFixed(1)}%`
                  : "N/A",
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildLineChartData(logs: FaceLog[]) {
  const days: Record<string, number> = {};
  logs.forEach((l) => {
    const day = new Date(l.timestamp).toLocaleDateString("en-US", {
      weekday: "short",
    });
    days[day] = (days[day] || 0) + 1;
  });
  return Object.entries(days).map(([date, detections]) => ({
    date,
    detections,
  }));
}

function buildHourlyData(logs: FaceLog[]) {
  const hours: Record<string, number> = {};
  logs.forEach((l) => {
    const h = new Date(l.timestamp).getHours();
    const label = `${String(h).padStart(2, "0")}:00`;
    hours[label] = (hours[label] || 0) + 1;
  });
  return Object.entries(hours)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour, count }));
}

// ── Component ─────────────────────────────────────────────────────────────────

const EXPORT_HEADERS = [
  "Timestamp",
  "Name",
  "CNIC",
  "Confidence",
  "Status",
  "Source",
  "Camera ID",
  "File Name",
];

const EXPORT_OPTIONS = [
  { id: "csv", label: "CSV Spreadsheet", icon: Sheet },
  { id: "json", label: "JSON Data", icon: FileJson },
  { id: "pdf", label: "PDF Document", icon: Printer },
] as const;

type ExportFormat = (typeof EXPORT_OPTIONS)[number]["id"];

function buildExportRows(logs: FaceLog[]) {
  return logs.map((log) => [
    new Date(log.timestamp).toLocaleString(),
    log.name || "Unknown",
    log.cnic || "",
    log.confidence > 0 ? `${Number(log.confidence).toFixed(1)}%` : "N/A",
    log.status,
    log.source || "",
    log.camera_id || "",
    log.file_name || "",
  ]);
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadFile(content: string, mimeType: string, fileName: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function FaceLogsAnalyticsPage() {
  const [logs, setLogs] = useState<FaceLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lightbox, setLightbox] = useState<{
    src: string;
    log: FaceLog;
  } | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "50",
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      });

      const res = await fetch(`${API_BASE}/face-logs?${params}`);
      const result = await res.json();

      if (result.status === "success") {
        setLogs(result.logs);
        setSummary(result.summary);
        setTotalPages(result.pagination.total_pages || 1);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Failed to load logs. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = (format: ExportFormat) => {
    setError(null);

    const rows = buildExportRows(logs);

    if (format === "csv") {
      const csv = [EXPORT_HEADERS, ...rows]
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\n");
      downloadFile(csv, "text/csv", "face_logs.csv");
      return;
    }

    if (format === "json") {
      const payload = logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        display_timestamp: new Date(log.timestamp).toLocaleString(),
        name: log.name || "Unknown",
        cnic: log.cnic || "",
        confidence: log.confidence,
        display_confidence:
          log.confidence > 0 ? `${Number(log.confidence).toFixed(1)}%` : "N/A",
        status: log.status,
        source: log.source || "",
        camera_id: log.camera_id || "",
        file_name: log.file_name || "",
        has_annotated_image: Boolean(log.annotated_image),
      }));
      downloadFile(
        JSON.stringify(payload, null, 2),
        "application/json",
        "face_logs.json"
      );
      return;
    }

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>Face Logs Analytics</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            p { margin: 0 0 18px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f8fafc; font-weight: 700; }
            tr:nth-child(even) { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Face Logs Analytics</h1>
          <p>Exported on ${escapeHtml(new Date().toLocaleString())}</p>
          <table>
            <thead>
              <tr>${EXPORT_HEADERS.map(
                (header) => `<th>${escapeHtml(header)}</th>`
              ).join("")}</tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) =>
                    `<tr>${row
                      .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                      .join("")}</tr>`
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>`;

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setError("Please allow pop-ups to export the PDF.");
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const pieChartData = summary
    ? [
        { name: "Matched", value: summary.matched },
        { name: "Unknown", value: summary.unknown },
        { name: "Failed", value: summary.failed },
      ]
    : [];

  const lineData = buildLineChartData(logs);
  const hourlyData = buildHourlyData(logs);

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
            to="/dashboard/face-detection"
            className="cursor-pointer p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-700" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-800">
              Logs & Analytics
            </h1>
            <p className="text-slate-600">
              Face recognition logs and statistics
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="cursor-pointer p-2 rounded-lg hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-slate-600" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-linear-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export as</DropdownMenuLabel>
              {EXPORT_OPTIONS.map(({ id, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => handleExport(id)}
                  className="cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-slate-500" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="Matched">Matched</option>
                <option value="Unknown">Unknown</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  label: "Total Detections",
                  value: summary?.total_detections ?? 0,
                  sub: `${summary?.success_rate ?? 0}% success rate`,
                  color: "text-slate-800",
                },
                {
                  label: "Matched Faces",
                  value: summary?.matched ?? 0,
                  sub: "Enrolled residents",
                  color: "text-green-600",
                },
                {
                  label: "Unknown Faces",
                  value: summary?.unknown ?? 0,
                  sub: "Not enrolled",
                  color: "text-yellow-600",
                },
                {
                  label: "Avg. Confidence",
                  value: `${summary?.avg_confidence ?? 0}%`,
                  sub: "Across all detections",
                  color: "text-blue-600",
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
                  Detection Trend (by Day)
                </h3>
                {lineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lineData}>
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
                ) : (
                  <p className="text-slate-400 text-center py-12">
                    No data yet
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  Hourly Distribution
                </h3>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-slate-400 text-center py-12">
                    No data yet
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  Detection Status Breakdown
                </h3>
                {pieChartData.some((d) => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${(percent * 100).toFixed(0)}%`
                        }
                        outerRadius={90}
                        dataKey="value"
                      >
                        {pieChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-slate-400 text-center py-12">
                    No data yet
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  Quick Summary
                </h3>
                <div className="space-y-3">
                  {[
                    {
                      label: "Matched",
                      value: summary?.matched ?? 0,
                      bg: "bg-green-50",
                      text: "text-green-700",
                    },
                    {
                      label: "Unknown",
                      value: summary?.unknown ?? 0,
                      bg: "bg-yellow-50",
                      text: "text-yellow-700",
                    },
                    {
                      label: "Failed",
                      value: summary?.failed ?? 0,
                      bg: "bg-red-50",
                      text: "text-red-700",
                    },
                    {
                      label: "Total",
                      value: summary?.total_detections ?? 0,
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

            {/* Logs table */}
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
                      {[
                        "Result",
                        "Timestamp",
                        "Name",
                        "CNIC",
                        "Confidence",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          {log.annotated_image ? (
                            <button
                              onClick={() =>
                                setLightbox({
                                  src: log.annotated_image as string,
                                  log,
                                })
                              }
                              className="group relative cursor-pointer w-16 h-12 rounded-md overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
                              title="Open thumbnail"
                            >
                              <img
                                src={log.annotated_image}
                                alt="Face result thumbnail"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              No image
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {log.name || "Unknown"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {log.cnic || "—"}
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
                        {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {log.location || "—"}
                        </td> */}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {logs.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  No face recognition logs yet. Use the Image Capture page to
                  start detecting.
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default FaceLogsAnalyticsPage;
