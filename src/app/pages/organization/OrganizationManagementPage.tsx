import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  User,
  UserX,
  Users,
} from "lucide-react";
import { buildAuthHeaders, getAuthSession } from "../../services/authSession";
import { hasPremiumAccess } from "../../services/billingApi";

const API_BASE = "http://127.0.0.1:5000";

type MemberRole = "manager" | "operator" | "viewer";

interface Member {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  role: string;
  organization_name?: string;
  is_active: boolean;
  created_at: string;
}

function OrganizationManagementPage() {
  const navigate = useNavigate();
  const session = getAuthSession();
  const sessionEmail = (session?.email || "").trim().toLowerCase();
  const isUpgraded = hasPremiumAccess();
  const freeMemberLimit = 5;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "toggle";
    member: Member;
    nextActive?: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    username: "",
    password: "",
    role: "operator" as MemberRole,
  });

  useEffect(() => {
    if (!session) {
      navigate("/dashboard", { replace: true });
      return;
    }

    const role = session.role.toLowerCase();
    // Only owners can manage members
    if (role !== "owner") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, session]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/members`, {
        headers: buildAuthHeaders(),
      });
      const result = await res.json();

      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to load members");
        return;
      }

      setMembers(result?.data?.members || []);
    } catch {
      setError("Unable to load members. Check backend connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.is_active).length,
    [members]
  );
  const totalMembers = members.length;
  const freeLimitReached = !isUpgraded && totalMembers >= freeMemberLimit;

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/auth/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          display_name: form.displayName,
          email: form.email,
          username: form.username || undefined,
          password: form.password,
          role: form.role,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to create member");
        return;
      }

      setSuccess("Member added successfully.");
      setForm({
        displayName: "",
        email: "",
        username: "",
        password: "",
        role: "operator",
      });
      await fetchMembers();
    } catch {
      setError("Unable to create member. Check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (memberId: string, memberEmail: string) => {
    if (memberEmail.trim().toLowerCase() === sessionEmail) {
      setError("Owner cannot delete their own account.");
      return;
    }

    const target = members.find((m) => m.id === memberId);
    if (!target) {
      setError("Member not found.");
      return;
    }

    setConfirmAction({ type: "delete", member: target });
  };

  const handleToggleMemberStatus = (member: Member) => {
    const email = member.email.trim().toLowerCase();
    if (email === sessionEmail) {
      setError("Owner cannot change their own account status.");
      return;
    }

    setConfirmAction({
      type: "toggle",
      member,
      nextActive: !member.is_active,
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res =
        confirmAction.type === "delete"
          ? await fetch(`${API_BASE}/auth/members/${confirmAction.member.id}`, {
              method: "DELETE",
              headers: buildAuthHeaders(),
            })
          : await fetch(
              `${API_BASE}/auth/members/${confirmAction.member.id}/status`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  ...buildAuthHeaders(),
                },
                body: JSON.stringify({ is_active: confirmAction.nextActive }),
              }
            );

      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        setError(result?.message || "Failed to update member");
        return;
      }

      setSuccess(
        confirmAction.type === "delete"
          ? "Member deleted successfully."
          : confirmAction.nextActive
          ? "Member activated successfully."
          : "Member deactivated successfully."
      );
      setConfirmAction(null);
      await fetchMembers();
    } catch {
      setError("Unable to update member. Check backend connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Organization Members
          </h1>
          <p className="text-slate-600">
            Owner-only access to manage members for your organization.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-200/50">
          <p className="text-sm text-slate-500">Organization</p>
          <p className="text-xl font-bold text-slate-800 mt-1 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {session?.organizationName || "Unknown"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-200/50">
          <p className="text-sm text-slate-500">Total Members</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {totalMembers}
          </p>
          {!isUpgraded && (
            <p className="mt-1 text-xs text-slate-500">
              Free limit: {freeMemberLimit}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border border-slate-200/50">
          <p className="text-sm text-slate-500">Active Members</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {activeMembers}
          </p>
          {!isUpgraded && (
            <p className="mt-1 text-xs text-slate-500">
              Free limit: {freeMemberLimit}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-800">Add Member</h2>
        </div>
        {freeLimitReached && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Free organizations can have up to {freeMemberLimit} total members.
            Inactive accounts still count toward the limit. Upgrade to add
            unlimited members.
          </p>
        )}

        <form
          onSubmit={handleCreateMember}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Display Name
            </label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. Ali Khan"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="user@org.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Username (Optional)
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="username"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as MemberRole })
              }
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="manager">Manager</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700 mb-1 block">
              Temporary Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Set a temporary password"
              required
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving || freeLimitReached}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-linear-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Add Member
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
            <Shield className="w-5 h-5 text-blue-600" />
            Organization Member List
          </h2>
          <button
            onClick={fetchMembers}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <p className="text-slate-600">No members found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-600">Member</th>
                  <th className="text-left py-2 text-slate-600">Role</th>
                  <th className="text-left py-2 text-slate-600">Status</th>
                  <th className="text-left py-2 text-slate-600">Joined</th>
                  {session?.role.toLowerCase() === "owner" && (
                    <th className="text-left py-2 text-slate-600">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100">
                    <td className="py-3">
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 mt-0.5 text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-800">
                            {member.display_name ||
                              member.username ||
                              member.email}
                          </p>
                          <p className="text-slate-500 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium uppercase">
                        {member.role}
                      </span>
                    </td>
                    <td className="py-3">
                      {session?.role.toLowerCase() === "owner" &&
                      member.email.trim().toLowerCase() !== sessionEmail ? (
                        <label className="flex items-center cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={member.is_active}
                            onChange={() => handleToggleMemberStatus(member)}
                            className="hidden"
                          />
                          <div
                            className={`w-10 h-6 rounded-full transition-colors duration-200 ${
                              member.is_active
                                ? "bg-green-500 group-hover:bg-green-600"
                                : "bg-slate-300 group-hover:bg-slate-400"
                            } flex items-center p-0.5 cursor-pointer`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                member.is_active
                                  ? "translate-x-4"
                                  : "translate-x-0"
                              }`}
                            />
                          </div>
                          <span className="ml-2 text-xs font-medium text-slate-600 cursor-pointer">
                            {member.is_active ? "Active" : "Inactive"}
                          </span>
                        </label>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            member.is_active
                              ? "bg-green-50 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600">
                      {new Date(member.created_at).toLocaleString()}
                    </td>
                    {session?.role.toLowerCase() === "owner" &&
                      member.email.trim().toLowerCase() !== sessionEmail && (
                        <td className="py-3">
                          <button
                            onClick={() =>
                              handleDeleteMember(member.id, member.email)
                            }
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete member"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-200">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                {confirmAction.type === "delete"
                  ? "Delete Member"
                  : confirmAction.nextActive
                  ? "Activate Member"
                  : "Deactivate Member"}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {confirmAction.type === "delete"
                  ? `Are you sure you want to delete ${confirmAction.member.email}?`
                  : `Are you sure you want to ${
                      confirmAction.nextActive ? "activate" : "deactivate"
                    } ${confirmAction.member.email}?`}
              </p>
            </div>
            <div className="p-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 transition-colors cursor-pointer ${
                  confirmAction.type === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizationManagementPage;
