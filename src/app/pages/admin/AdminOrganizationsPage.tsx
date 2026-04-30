import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Building2,
  BadgeCheck,
  Loader2,
  Plus,
  RefreshCw,
  Mail,
  User,
  Trash2,
} from "lucide-react";
import { buildAuthHeaders, getAuthSession } from "../../services/authSession";

const API_BASE = "http://127.0.0.1:5000";

interface Organization {
  id: string;
  name: string;
  code?: string;
  owner_email?: string;
  owner_name?: string;
  is_active: boolean;
  created_at: string;
  billing?: {
    plan?: "free" | "premium";
    is_upgraded?: boolean;
  };
}

function AdminOrganizationsPage() {
  const navigate = useNavigate();
  const session = getAuthSession();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: "delete" | "toggle";
    org: Organization;
    nextActive?: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    organizationName: "",
    ownerDisplayName: "",
    ownerEmail: "",
    ownerPassword: "",
  });

  // Guard: Only admins can access this page
  useEffect(() => {
    if (!session || session.role.toLowerCase() !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, session]);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("Fetching organizations...");
      const res = await fetch(`${API_BASE}/auth/organizations`, {
        headers: buildAuthHeaders(),
      });
      const result = await res.json();

      console.log("Organizations response:", result);

      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to load organizations");
        return;
      }

      const orgs = result?.data?.organizations || [];
      console.log("Organizations loaded:", orgs.length);
      setOrganizations(orgs);
    } catch (err) {
      console.error("Failed to load organizations:", err);
      setError("Unable to load organizations. Check backend connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Validation
    if (!form.organizationName.trim()) {
      setError("Organization name is required");
      setSaving(false);
      return;
    }
    if (!form.ownerEmail.trim()) {
      setError("Owner email is required");
      setSaving(false);
      return;
    }
    if (!form.ownerPassword.trim()) {
      setError("Owner password is required");
      setSaving(false);
      return;
    }

    try {
      console.log("Creating organization:", {
        organization_name: form.organizationName,
        email: form.ownerEmail,
        display_name: form.ownerDisplayName || undefined,
      });

      const res = await fetch(`${API_BASE}/auth/organizations/owner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          organization_name: form.organizationName,
          email: form.ownerEmail,
          display_name: form.ownerDisplayName || undefined,
          password: form.ownerPassword,
        }),
      });

      const result = await res.json();
      console.log("Create organization response:", result);

      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to create organization");
        return;
      }

      setSuccess("Organization and owner created successfully.");
      setForm({
        organizationName: "",
        ownerDisplayName: "",
        ownerEmail: "",
        ownerPassword: "",
      });

      // Force a small delay to ensure Supabase has processed the insert
      setTimeout(() => {
        fetchOrganizations();
      }, 500);
    } catch (err) {
      console.error("Failed to create organization:", err);
      setError("Unable to create organization. Check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrganization = (org: Organization) => {
    setPendingAction({ type: "delete", org });
  };

  const handleToggleOrganizationStatus = (org: Organization) => {
    setPendingAction({
      type: "toggle",
      org,
      nextActive: !org.is_active,
    });
  };

  const confirmOrganizationAction = async () => {
    if (!pendingAction) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res =
        pendingAction.type === "delete"
          ? await fetch(
              `${API_BASE}/auth/organizations/${pendingAction.org.id}`,
              {
                method: "DELETE",
                headers: buildAuthHeaders(),
              }
            )
          : await fetch(
              `${API_BASE}/auth/organizations/${pendingAction.org.id}/status`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  ...buildAuthHeaders(),
                },
                body: JSON.stringify({ is_active: pendingAction.nextActive }),
              }
            );

      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to update organization");
        return;
      }

      setSuccess(
        pendingAction.type === "delete"
          ? "Organization deleted permanently."
          : pendingAction.nextActive
          ? "Organization activated successfully."
          : "Organization deactivated successfully."
      );
      setPendingAction(null);
      await fetchOrganizations();
    } catch {
      setError("Unable to update organization. Check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            System Administrator Organizations
          </h1>
          <p className="text-slate-600">
            System Administrator access to create organizations and assign
            owners.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-200/50">
          <p className="text-sm text-slate-500">Role</p>
          <p className="text-xl font-bold text-slate-800 mt-1 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            System Administrator
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-200/50">
          <p className="text-sm text-slate-500">Total Organizations</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {organizations.length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-800">
            Create Organization
          </h2>
        </div>

        <form
          onSubmit={handleCreateOrganization}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Organization Name *
            </label>
            <input
              type="text"
              value={form.organizationName}
              onChange={(e) =>
                setForm({ ...form, organizationName: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. North District Police"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Owner Display Name (Optional)
            </label>
            <input
              type="text"
              value={form.ownerDisplayName}
              onChange={(e) =>
                setForm({ ...form, ownerDisplayName: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. Ali Khan"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Owner Email *
            </label>
            <input
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="owner@organization.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Owner Password *
            </label>
            <input
              type="password"
              value={form.ownerPassword}
              onChange={(e) =>
                setForm({ ...form, ownerPassword: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Set a strong password for the owner"
              required
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-linear-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  Create Organization & Owner
                </>
              )}
            </button>
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-green-600">{success}</p>}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Organizations List
          </h2>
          <button
            onClick={fetchOrganizations}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading organizations...
          </div>
        ) : organizations.length === 0 ? (
          <p className="text-slate-600">No organizations found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-600">
                    Organization
                  </th>
                  <th className="text-left py-2 text-slate-600">Plan</th>
                  <th className="text-left py-2 text-slate-600">Code</th>
                  <th className="text-left py-2 text-slate-600">Owner</th>
                  <th className="text-left py-2 text-slate-600">Status</th>
                  <th className="text-left py-2 text-slate-600">Created</th>
                  <th className="text-left py-2 text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-b border-slate-100">
                    <td className="py-3">
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 mt-0.5 text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-800">
                            {org.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          org.billing?.plan === "premium"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {org.billing?.plan === "premium" ? "Paid" : "Free"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium uppercase">
                        {org.code || "—"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div>
                        <p className="font-medium text-slate-800">
                          {org.owner_name || "—"}
                        </p>
                        <p className="text-slate-500 flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {org.owner_email || "—"}
                        </p>
                      </div>
                    </td>
                    <td className="py-3">
                      <label className="flex items-center cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={org.is_active}
                          onChange={() => handleToggleOrganizationStatus(org)}
                          disabled={saving}
                          className="hidden"
                        />
                        <div
                          className={`w-10 h-6 rounded-full transition-colors duration-200 ${
                            org.is_active
                              ? "bg-green-500 group-hover:bg-green-600"
                              : "bg-slate-300 group-hover:bg-slate-400"
                          } flex items-center p-0.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                              org.is_active ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </div>
                        <span className="ml-2 text-xs font-medium text-slate-600 select-none">
                          {org.is_active ? "Active" : "Inactive"}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 text-slate-600">
                      {new Date(org.created_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDeleteOrganization(org)}
                        disabled={saving}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="Delete organization"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-200">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                {pendingAction.type === "delete"
                  ? "Delete Organization"
                  : pendingAction.nextActive
                  ? "Activate Organization"
                  : "Deactivate Organization"}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {pendingAction.type === "delete"
                  ? `Delete "${pendingAction.org.name}" permanently? This cannot be undone.`
                  : `Are you sure you want to ${
                      pendingAction.nextActive ? "activate" : "deactivate"
                    } "${pendingAction.org.name}"?`}
              </p>
            </div>
            <div className="p-5 flex justify-end gap-3">
              <button
                onClick={() => setPendingAction(null)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmOrganizationAction}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  pendingAction.type === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminOrganizationsPage;
