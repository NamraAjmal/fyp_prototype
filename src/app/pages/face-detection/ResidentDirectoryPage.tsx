import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Eye,
  Download,
  Filter,
  Loader2,
  X,
  Save,
  RefreshCw,
  FileText,
  Sheet,
  FileJson,
  Printer,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router";

const API_BASE = "http://127.0.0.1:5000";

function buildResidentImageSrc(cnic: string, imagePath: string) {
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  return `${API_BASE}/get-resident-image/${cnic}/${imagePath}`;
}

interface Resident {
  cnic: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  enrolled_at: string;
  image_count: number;
  faces_detected: number;
  status: "Active" | "Inactive";
  images?: string[];
}

// ── Avatar: always tries to load the first enrollment image ──────────────────
// We construct the image URL from cnic + "image_1.jpg" as a best-guess when
// the images array isn't populated, and fall back to the initial letter.
function ResidentAvatar({
  resident,
  size = "sm",
}: {
  resident: Resident;
  size?: "sm" | "lg";
}) {
  const [imgError, setImgError] = useState(false);

  // Use the first item from images[] if available, otherwise try image_1.jpg
  const imageName =
    resident.images?.[0] ?? (resident.image_count > 0 ? "image_1.jpg" : null);

  const sizeClasses = size === "lg" ? "w-16 h-16 text-2xl" : "w-9 h-9 text-sm";

  if (imageName && !imgError) {
    return (
      <img
        src={buildResidentImageSrc(resident.cnic, imageName)}
        alt={resident.name}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full object-cover shrink-0 ring-2 ring-slate-200 bg-slate-100`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold shrink-0`}
    >
      {resident.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Export dropdown ───────────────────────────────────────────────────────────
const EXPORT_OPTIONS = [
  { id: "csv", label: "CSV Spreadsheet", icon: Sheet },
  { id: "json", label: "JSON Data", icon: FileJson },
  { id: "print", label: "Print / Save as PDF", icon: Printer },
];

function ExportDropdown({ residents }: { residents: Resident[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const doExport = (id: string) => {
    setOpen(false);
    const headers = [
      "CNIC",
      "Name",
      "Email",
      "Phone",
      "City",
      "Status",
      "Enrolled At",
      "Images",
      "Faces",
    ];
    const rows = residents.map((r) => [
      r.cnic,
      r.name,
      r.email,
      r.phone,
      r.city || "",
      r.status,
      r.enrolled_at,
      String(r.image_count),
      String(r.faces_detected),
    ]);

    if (id === "print") {
      const html = `<html><head><title>Residents</title><style>
        body{font-family:sans-serif;font-size:12px;color:#111}
        h2{margin-bottom:12px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
        th{background:#f5f5f5;font-weight:600}
        tr:nth-child(even){background:#fafafa}
      </style></head><body>
        <h2>Resident Directory — ${new Date().toLocaleDateString()}</h2>
        <table><thead><tr>${headers
          .map((h) => `<th>${h}</th>`)
          .join("")}</tr></thead>
        <tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody>
        </table></body></html>`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }
      return;
    }

    let content = "";
    let mime = "text/plain";
    let ext = "txt";

    if (id === "csv") {
      content = [headers, ...rows]
        .map((r) => r.map((c) => `"${c}"`).join(","))
        .join("\n");
      mime = "text/csv";
      ext = "csv";
    } else if (id === "tsv") {
      content = [headers, ...rows].map((r) => r.join("\t")).join("\n");
      mime = "text/tab-separated-values";
      ext = "tsv";
    } else if (id === "json") {
      content = JSON.stringify(residents, null, 2);
      mime = "application/json";
      ext = "json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `residents.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none text-slate-700"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden py-1">
          <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Export as
          </p>
          {EXPORT_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => doExport(id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteConfirmModal({
  resident,
  onCancel,
  onConfirm,
  deleting,
}: {
  resident: Resident;
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            Delete Resident
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Resident card */}
          <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <ResidentAvatar resident={resident} size="sm" />
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate text-sm">
                {resident.name}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {resident.cnic}
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Are you sure?
              </p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                This will permanently delete {resident.name}'s profile and all{" "}
                {resident.image_count} enrollment images. This cannot be undone.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors cursor-pointer"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({
  resident,
  onClose,
  onSaved,
}: {
  resident: Resident;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: resident.name,
    email: resident.email,
    phone: resident.phone,
    address: resident.address,
    city: resident.city,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/update-resident/${resident.cnic}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.status === "success") {
        onSaved();
        onClose();
      } else setError(result.message);
    } catch {
      setError("Failed to save. Is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <ResidentAvatar resident={resident} size="sm" />
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                Edit Resident
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {resident.cnic}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </p>
          )}
          {(["name", "email", "phone", "address", "city"] as const).map(
            (field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 capitalize">
                  {field}
                </label>
                {field === "address" ? (
                  <textarea
                    value={form[field]}
                    onChange={(e) =>
                      setForm({ ...form, [field]: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none transition-all text-sm text-slate-800"
                    rows={2}
                  />
                ) : (
                  <input
                    type={field === "email" ? "email" : "text"}
                    value={form[field]}
                    onChange={(e) =>
                      setForm({ ...form, [field]: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm text-slate-800"
                  />
                )}
              </div>
            )
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiFormatImage({ cnic, index }: { cnic: string; index: number }) {
  const [srcIndex, setSrcIndex] = useState(0);

  const formats = ["jpg", "jpeg", "png"];

  const handleError = () => {
    if (srcIndex < formats.length - 1) {
      setSrcIndex((prev) => prev + 1);
    }
  };

  return (
    <div className="relative group aspect-square overflow-hidden rounded-lg border border-slate-200">
      <img
        src={`${API_BASE}/get-resident-image/${cnic}/image_${index}.${formats[srcIndex]}`}
        onError={handleError}
        alt={`photo ${index}`}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center">
        <span className="text-white text-xs">#{index}</span>
      </div>
    </div>
  );
}

// ── View modal ────────────────────────────────────────────────────────────────
function ViewModal({
  resident,
  onClose,
}: {
  resident: Resident;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <ResidentAvatar resident={resident} size="lg" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {resident.name}
              </h2>
              <p className="text-sm text-slate-500 font-mono">
                {resident.cnic}
              </p>
              <span
                className={`inline-flex mt-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  resident.status === "Active"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {resident.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Email", resident.email],
              ["Phone", resident.phone],
              ["City", resident.city || "—"],
              ["Address", resident.address || "—"],
              [
                "Enrolled",
                new Date(resident.enrolled_at).toLocaleDateString("en-PK", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
              ],
              ["Images uploaded", String(resident.image_count)],
              ["Faces detected", String(resident.faces_detected)],
              ["Model", "InsightFace"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="bg-slate-50 rounded-lg p-3 border border-slate-100"
              >
                <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-slate-800 wrap-break-word">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Enrollment photos */}
          {resident.images && resident.images.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Enrollment Photos{" "}
                <span className="text-slate-400 font-normal">
                  ({resident.images.length})
                </span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {resident.images.map((img, i) => (
                  <div
                    key={i}
                    className="relative group aspect-square overflow-hidden rounded-lg border border-slate-200 cursor-zoom-in"
                  >
                    <img
                      src={buildResidentImageSrc(resident.cnic, img)}
                      alt={`Enrollment photo ${i + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-semibold">
                        #{i + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : resident.image_count > 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Enrollment Photos{" "}
                <span className="text-slate-400 font-normal">
                  ({resident.image_count})
                </span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: resident.image_count }, (_, index) => (
                  <MultiFormatImage
                    key={index}
                    cnic={resident.cnic}
                    index={index + 1}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No images found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ResidentDirectoryPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editTarget, setEditTarget] = useState<Resident | null>(null);
  const [viewTarget, setViewTarget] = useState<Resident | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resident | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchResidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/get-residents`);
      const result = await res.json();

      if (result.status !== "success") {
        setError(result.message || "Failed to load residents.");
        return;
      }

      const enriched = await Promise.all(
        (result.residents ?? []).map(async (resident: Resident) => {
          if (Array.isArray(resident.images) && resident.images.length > 0) {
            return resident;
          }

          try {
            const detailRes = await fetch(
              `${API_BASE}/get-resident/${resident.cnic}`
            );
            const detailResult = await detailRes.json();
            if (
              detailResult.status === "success" &&
              Array.isArray(detailResult.resident?.images)
            ) {
              return {
                ...resident,
                images: detailResult.resident.images,
                image_count:
                  detailResult.resident.image_count ?? resident.image_count,
              };
            }
          } catch {
            // keep the base resident row if the detail request fails
          }

          return resident;
        })
      );

      setResidents(enriched);
    } catch {
      setError("Failed to load residents. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  const handleView = (resident: Resident) => {
    setViewTarget(resident);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE}/delete-resident/${deleteTarget.cnic}`,
        { method: "DELETE" }
      );
      const result = await res.json();
      if (result.status === "success") {
        setResidents((prev) =>
          prev.filter((resident) => resident.cnic !== deleteTarget.cnic)
        );
        setDeleteTarget(null);
      } else {
        alert("Error: " + result.message);
      }
    } catch {
      alert("Failed to delete resident.");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (resident: Resident) => {
    const newStatus = resident.status === "Active" ? "Inactive" : "Active";

    try {
      const res = await fetch(
        `${API_BASE}/update-resident-status/${resident.cnic}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const result = await res.json();
      if (result.status === "success") {
        setResidents((prev) =>
          prev.map((row) =>
            row.cnic === resident.cnic ? { ...row, status: newStatus } : row
          )
        );
      }
    } catch {
      alert("Failed to update status.");
    }
  };

  const filteredResidents = residents.filter((resident) => {
    const q = searchQuery.toLowerCase();
    return (
      (resident.name.toLowerCase().includes(q) ||
        resident.cnic.includes(q) ||
        resident.email.toLowerCase().includes(q)) &&
      (filterStatus === "all" || resident.status.toLowerCase() === filterStatus)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/face-detection"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-800">
            Resident Directory
          </h1>
          <p className="text-slate-600">
            Manage and view all enrolled residents
          </p>
        </div>
        <button
          onClick={fetchResidents}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-slate-600" />
        </button>
        <Link
          to="/dashboard/face-detection/enrollment"
          className="px-4 py-2 bg-linear-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
        >
          + Add New
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search + Filters */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, CNIC, or email…"
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 transition-all cursor-pointer text-slate-800"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <ExportDropdown residents={filteredResidents} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-slate-500">Loading residents…</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {[
                      "CNIC",
                      "Name",
                      "Email",
                      "Phone",
                      "Enrolled",
                      "Images",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredResidents.map((resident) => (
                    <tr
                      key={resident.cnic}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono">
                        {resident.cnic}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <ResidentAvatar resident={resident} size="sm" />
                          <span className="text-sm font-medium text-slate-900">
                            {resident.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {resident.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {resident.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(resident.enrolled_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-center">
                        {resident.image_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(resident)}
                          className={`inline-flex px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                            resident.status === "Active"
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {resident.status}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleView(resident)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditTarget(resident)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(resident)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredResidents.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500">
                  {residents.length === 0
                    ? "No residents enrolled yet."
                    : "No residents match your search."}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Showing{" "}
                <span className="font-medium">{filteredResidents.length}</span>{" "}
                of <span className="font-medium">{residents.length}</span>{" "}
                residents
              </p>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {editTarget && (
        <EditModal
          resident={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchResidents}
        />
      )}
      {viewTarget && (
        <ViewModal resident={viewTarget} onClose={() => setViewTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          resident={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
}

export default ResidentDirectoryPage;
