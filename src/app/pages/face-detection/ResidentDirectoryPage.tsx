import { useState } from "react";
import {
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Eye,
  Download,
  Filter,
} from "lucide-react";
import { Link } from "react-router";

// Mock data
const mockResidents = [
  {
    id: 1,
    cnic: "12345-1234567-1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+92 300 1234567",
    status: "Active",
  },
  {
    id: 2,
    cnic: "23456-2345678-2",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+92 301 2345678",
    status: "Active",
  },
  {
    id: 3,
    cnic: "34567-3456789-3",
    name: "Mike Johnson",
    email: "mike@example.com",
    phone: "+92 302 3456789",
    status: "Active",
  },
  {
    id: 4,
    cnic: "45678-4567890-4",
    name: "Sarah Williams",
    email: "sarah@example.com",
    phone: "+92 303 4567890",
    status: "Inactive",
  },
  {
    id: 5,
    cnic: "56789-5678901-5",
    name: "David Brown",
    email: "david@example.com",
    phone: "+92 304 5678901",
    status: "Active",
  },
  {
    id: 6,
    cnic: "67890-6789012-6",
    name: "Emily Davis",
    email: "emily@example.com",
    phone: "+92 305 6789012",
    status: "Active",
  },
  {
    id: 7,
    cnic: "78901-7890123-7",
    name: "Chris Wilson",
    email: "chris@example.com",
    phone: "+92 306 7890123",
    status: "Active",
  },
  {
    id: 8,
    cnic: "89012-8901234-8",
    name: "Lisa Martinez",
    email: "lisa@example.com",
    phone: "+92 307 8901234",
    status: "Inactive",
  },
];

function ResidentDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredResidents = mockResidents.filter((resident) => {
    const matchesSearch =
      resident.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resident.cnic.includes(searchQuery) ||
      resident.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === "all" || resident.status.toLowerCase() === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      console.log("Deleting resident:", id);
      alert("Resident deleted successfully!");
    }
  };

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
            Resident Directory
          </h1>
          <p className="text-slate-600">
            Manage and view all enrolled residents
          </p>
        </div>
        <Link
          to="/dashboard/face-detection/enrollment"
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          + Add New
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, CNIC, or email..."
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Export Button */}
          <button className="flex items-center gap-2 px-4 py-3 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  CNIC
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredResidents.map((resident) => (
                <tr
                  key={resident.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                    {resident.cnic}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-medium">
                        {resident.name.charAt(0)}
                      </div>
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                        resident.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {resident.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(resident.id, resident.name)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

        {/* Empty State */}
        {filteredResidents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">
              No residents found matching your search.
            </p>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            Showing{" "}
            <span className="font-medium">{filteredResidents.length}</span> of{" "}
            <span className="font-medium">{mockResidents.length}</span>{" "}
            residents
          </p>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Previous
            </button>
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              1
            </button>
            <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              2
            </button>
            <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResidentDirectoryPage;
