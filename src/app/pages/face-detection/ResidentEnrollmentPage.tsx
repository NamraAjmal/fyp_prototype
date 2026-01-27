import { useState } from "react";
import {
  ArrowLeft,
  Upload,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Save,
} from "lucide-react";
import { Link } from "react-router";

function ResidentEnrollmentPage() {
  const [formData, setFormData] = useState({
    cnic: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    images: [] as File[],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Enrollment data:", formData);
    // Handle form submission
    alert("Resident enrolled successfully!");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setFormData({ ...formData, images: [...formData.images, ...filesArray] });
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
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Resident Enrollment
          </h1>
          <p className="text-slate-600">
            Add a new resident to the facial recognition system
          </p>
        </div>
      </div>

      {/* Enrollment Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-8 shadow-md border border-slate-200/50"
      >
        <div className="space-y-6">
          {/* CNIC */}
          <div>
            <label
              htmlFor="cnic"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
            >
              <CreditCard className="w-4 h-4" />
              CNIC Number
            </label>
            <input
              id="cnic"
              type="text"
              value={formData.cnic}
              onChange={(e) =>
                setFormData({ ...formData, cnic: e.target.value })
              }
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="e.g., 12345-1234567-1"
              required
            />
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="name"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
            >
              <User className="w-4 h-4" />
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Enter full name"
              required
            />
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="email"
                className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
              >
                <Mail className="w-4 h-4" />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="email@example.com"
                required
              />
            </div>
            <div>
              <label
                htmlFor="phone"
                className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
              >
                <Phone className="w-4 h-4" />
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="+92 300 1234567"
                required
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label
              htmlFor="address"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
            >
              <MapPin className="w-4 h-4" />
              Address (Optional)
            </label>
            <textarea
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
              placeholder="Enter street address"
              rows={3}
            />
          </div>

          {/* City */}
          <div>
            <label
              htmlFor="city"
              className="text-sm font-medium text-slate-700 mb-2 block"
            >
              City (Optional)
            </label>
            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Enter city"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <Upload className="w-4 h-4" />
              Upload Images (Minimum 3 required)
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 hover:border-blue-500 transition-colors cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <Upload className="w-12 h-12 text-slate-400 mb-3" />
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-500">
                  PNG, JPG or JPEG (Max 5MB each)
                </p>
              </label>
            </div>
            {formData.images.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-4">
                {formData.images.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newImages = formData.images.filter(
                          (_, i) => i !== index
                        );
                        setFormData({ ...formData, images: newImages });
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="sr-only">Remove</span>✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-slate-500 mt-2">
              {formData.images.length} image(s) uploaded
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
            <Link
              to="/dashboard/face-detection"
              className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              <Save className="w-4 h-4" />
              Enroll Resident
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ResidentEnrollmentPage;
