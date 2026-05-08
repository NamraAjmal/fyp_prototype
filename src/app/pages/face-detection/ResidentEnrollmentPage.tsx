import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Upload,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Save,
  CheckCircle,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { buildAuthHeaders } from "../../services/authSession";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const getFileSignature = (file: File) =>
  `${file.name}::${file.size}::${file.lastModified}`;

const bufferToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const PAKISTAN_CODE = "+92";
const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
const PAKISTANI_MOBILE_REGEX = /^0?3\d{9}$/;

const normalizeDigits = (value: string) => value.replace(/\D/g, "");

const buildPhoneValue = (phoneNumber: string) =>
  `${PAKISTAN_CODE} ${phoneNumber}`.trim();

function ResidentEnrollmentPage() {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [modalData, setModalData] = useState({
    success: false,
    message: "",
    name: "",
    cnic: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    imagesCount: 0,
    imageUrls: [] as string[],
  });

  const [formData, setFormData] = useState({
    cnic: "",
    name: "",
    email: "",
    phoneNumber: "",
    address: "",
    city: "",
    images: [] as File[],
  });

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showModal]);

  useEffect(() => {
    const urls = formData.images.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [formData.images]);

  const validateSelectedImages = async (images: File[]) => {
    if (images.length < 3) {
      return "Please upload at least 3 images.";
    }

    const uniqueByMeta = new Set(images.map(getFileSignature));
    if (uniqueByMeta.size !== images.length) {
      return "Duplicate images selected. Remove repeated files and try again.";
    }

    if (!window.crypto?.subtle) {
      return null;
    }

    const hashes = await Promise.all(
      images.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const digest = await window.crypto.subtle.digest("SHA-256", buffer);
        return bufferToHex(digest);
      })
    );

    const uniqueHashes = new Set(hashes);
    if (uniqueHashes.size !== hashes.length) {
      return "Same image content was uploaded more than once. Please use different photos.";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!CNIC_REGEX.test(formData.cnic.trim())) {
      setModalData({
        success: false,
        message: "CNIC must be in the format 12345-1234567-1.",
        name: "",
        cnic: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        imagesCount: 0,
        imageUrls: [],
      });
      setShowModal(true);
      return;
    }

    const normalizedPhoneNumber = normalizeDigits(formData.phoneNumber.trim());
    if (!PAKISTANI_MOBILE_REGEX.test(normalizedPhoneNumber)) {
      setModalData({
        success: false,
        message:
          "Phone number must be a valid Pakistani mobile number, such as 3001234567 or 03001234567.",
        name: "",
        cnic: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        imagesCount: 0,
        imageUrls: [],
      });
      setShowModal(true);
      return;
    }

    const imageValidationError = await validateSelectedImages(formData.images);
    if (imageValidationError) {
      setModalData({
        success: false,
        message: imageValidationError,
        name: "",
        cnic: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        imagesCount: 0,
        imageUrls: [],
      });
      setShowModal(true);
      return;
    }

    setLoading(true);

    const data = new FormData();
    const normalizedMobileNumber = normalizedPhoneNumber.startsWith("0")
      ? normalizedPhoneNumber.slice(1)
      : normalizedPhoneNumber;
    const phoneValue = buildPhoneValue(normalizedMobileNumber);
    data.append("cnic", formData.cnic);
    data.append("name", formData.name);
    data.append("email", formData.email);
    data.append("phone", phoneValue);
    data.append("address", formData.address);
    data.append("city", formData.city);

    formData.images.forEach((file) => data.append("images", file));

    try {
      const res = await fetch("http://127.0.0.1:5000/upload-images", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: data,
      });

      let result;
      try {
        result = await res.json();
        console.log("Server response:", result);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", parseError);
        throw new Error("Invalid response format from server");
      }

      if (!res.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            `Server responded with status ${res.status}`
        );
      }

      if (res.status === 200) {
        const isSuccess =
          result.status === "success" ||
          result.success === true ||
          result.data?.cnic;

        if (isSuccess) {
          const imageUrls =
            result.image_urls ||
            result.data?.image_urls ||
            formData.images.map((file) => URL.createObjectURL(file));

          setModalData({
            success: true,
            message:
              result.message || `${formData.name} enrolled successfully!`,
            name: formData.name,
            cnic: formData.cnic,
            email: formData.email,
            phone: phoneValue,
            address: formData.address,
            city: formData.city,
            imagesCount:
              result.images_count ||
              result.data?.images?.length ||
              formData.images.length,
            imageUrls: imageUrls,
          });

          setFormData({
            cnic: "",
            name: "",
            email: "",
            phoneNumber: "",
            address: "",
            city: "",
            images: [],
          });
        } else {
          setModalData({
            success: false,
            message: result.message || result.error || "Unknown error occurred",
            name: "",
            cnic: "",
            email: "",
            phone: "",
            address: "",
            city: "",
            imagesCount: 0,
            imageUrls: [],
          });
        }
      } else {
        setModalData({
          success: false,
          message:
            result?.message || result?.error || "Failed to enroll resident",
          name: "",
          cnic: "",
          email: "",
          phone: "",
          address: "",
          city: "",
          imagesCount: 0,
          imageUrls: [],
        });
      }
      setShowModal(true);
    } catch (err) {
      console.error("Enrollment error:", err);

      setModalData({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Enrollment failed. Ensure each image contains exactly one face of the same person and no duplicates.",
        name: "",
        cnic: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        imagesCount: 0,
        imageUrls: [],
      });
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) {
      return;
    }

    const filesArray = Array.from(e.target.files);
    const existingSignatures = new Set(formData.images.map(getFileSignature));
    const nextImages = [...formData.images];
    const rejected: string[] = [];

    filesArray.forEach((file) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        rejected.push(`${file.name}: unsupported format`);
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        rejected.push(`${file.name}: exceeds 5MB`);
        return;
      }

      const signature = getFileSignature(file);
      if (existingSignatures.has(signature)) {
        rejected.push(`${file.name}: duplicate file selected`);
        return;
      }

      existingSignatures.add(signature);
      nextImages.push(file);
    });

    setFormData({ ...formData, images: nextImages });

    if (rejected.length > 0) {
      setModalData({
        success: false,
        message: `Some files were skipped:\n${rejected.join("\n")}`,
        name: "",
        cnic: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        imagesCount: 0,
        imageUrls: [],
      });
      setShowModal(true);
    }

    e.target.value = "";
  };

  const closeModal = () => {
    // Clean up object URLs to prevent memory leaks
    modalData.imageUrls.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    setShowModal(false);
  };

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
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Resident Enrollment
          </h1>
          <p className="text-slate-600">
            Add a new resident to the enrollment system
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
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </label>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <div className="flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 font-semibold text-slate-700">
                  +92
                </div>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, phoneNumber: e.target.value })
                  }
                  inputMode="numeric"
                  pattern="0?3[0-9]{9}"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="3001234567 or 03001234567"
                  required
                />
              </div>
              {/* <p className="mt-2 text-xs text-slate-500">
                Pakistani mobile numbers only. The saved format will be +92
                followed by the mobile number.
              </p> */}
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
                      src={previewUrls[index]}
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
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <span className="sr-only">Remove</span>✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-slate-500 mt-2">
              {formData.images.length} image(s) uploaded (minimum 3 required)
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
            <Link
              to="/dashboard/face-detection"
              className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium shadow-lg transition-all cursor-pointer
                ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-linear-to-r from-blue-500 to-cyan-500 hover:scale-105 hover:shadow-xl cursor-pointer"
                }
              `}
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Enrolling...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enroll Resident
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Modal with Backdrop Blur */}
      {showModal && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop with blur - prevents interaction with background */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
            onClick={closeModal}
          />

          {/* Modal Container */}
          <div className="relative flex items-center justify-center min-h-screen p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {modalData.success ? (
                      <CheckCircle className="w-8 h-8 text-green-500 animate-bounce" />
                    ) : (
                      <X className="w-8 h-8 text-red-500" />
                    )}
                    <h3 className="text-2xl font-bold text-slate-800">
                      {modalData.success ? "Success!" : "Error"}
                    </h3>
                  </div>
                  <button
                    onClick={closeModal}
                    className="text-slate-400 hover:text-slate-600 transition-all cursor-pointer hover:scale-110"
                    aria-label="Close modal"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-slate-700 text-lg">{modalData.message}</p>

                  {modalData.success && modalData.imagesCount > 0 && (
                    <>
                      {/* Success Badge */}
                      <div className="mt-4 p-4 bg-linear-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <p className="text-sm text-green-800 font-medium">
                            ✓ {modalData.imagesCount} image(s) saved
                            successfully
                          </p>
                        </div>
                      </div>

                      {/* Resident Information Summary */}
                      <div className="mt-4 p-4 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                        <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Resident Information:
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <p className="text-blue-700">
                              <strong>Name:</strong>
                            </p>
                            <p className="text-blue-900">{modalData.name}</p>

                            <p className="text-blue-700">
                              <strong>CNIC:</strong>
                            </p>
                            <p className="text-blue-900">{modalData.cnic}</p>

                            <p className="text-blue-700">
                              <strong>Email:</strong>
                            </p>
                            <p className="text-blue-900">{modalData.email}</p>

                            <p className="text-blue-700">
                              <strong>Phone:</strong>
                            </p>
                            <p className="text-blue-900">{modalData.phone}</p>

                            {modalData.address && (
                              <>
                                <p className="text-blue-700">
                                  <strong>Address:</strong>
                                </p>
                                <p className="text-blue-900">
                                  {modalData.address}
                                </p>
                              </>
                            )}

                            {modalData.city && (
                              <>
                                <p className="text-blue-700">
                                  <strong>City:</strong>
                                </p>
                                <p className="text-blue-900">
                                  {modalData.city}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Uploaded Images Gallery */}
                      {modalData.imageUrls.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Uploaded Images:
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {modalData.imageUrls.map((url, index) => (
                              <div
                                key={index}
                                className="relative group overflow-hidden rounded-lg"
                              >
                                <img
                                  src={url}
                                  alt={`Resident ${index + 1}`}
                                  className="w-full h-32 object-cover rounded-lg border border-slate-200 shadow-sm hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
                                  Image {index + 1}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!modalData.success && (
                    <div className="mt-4 p-4 bg-linear-to-r from-red-50 to-rose-50 rounded-lg border border-red-200">
                      <div className="flex items-center gap-2">
                        <X className="w-5 h-5 text-red-600" />
                        <p className="text-sm text-red-800">
                          Please check the information and try again. Make sure
                          all required fields are filled correctly.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-6 py-2.5 bg-linear-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 cursor-pointer shadow-md hover:shadow-lg hover:scale-105"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS for modal animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes zoomIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-in {
          animation-duration: 0.3s;
          animation-timing-function: ease-out;
          animation-fill-mode: both;
        }
        
        .fade-in {
          animation-name: fadeIn;
        }
        
        .zoom-in {
          animation-name: zoomIn;
        }
        
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        
        .animate-bounce {
          animation: bounce 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default ResidentEnrollmentPage;
