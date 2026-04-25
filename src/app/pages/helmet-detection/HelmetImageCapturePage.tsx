import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Upload,
  Play,
  Square,
  RotateCcw,
  Loader2,
  ZoomIn,
  X,
} from "lucide-react";
import { Link } from "react-router";
import {
  detectHelmet,
  fetchHelmetLogs,
  type HelmetLog,
} from "../../services/helmetApi";

type DetectionResult = {
  id: number;
  fileName: string;
  personsDetected: number;
  helmetsDetected: number;
  compliance: boolean;
  confidence: number;
  status: string;
  timestamp: string;
  source: string;
  processingMs: number;
  annotatedImage?: string;
};

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white hover:text-slate-300"
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>
      <img
        src={src}
        alt="Annotated helmet detection"
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function HelmetImageCapturePage() {
  const STORAGE_KEY = "helmetDetection.captureResults.v1";
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>(
    []
  );
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toDetectionResult = (log: HelmetLog): DetectionResult => ({
    id: Number(log.id),
    fileName: log.file_name,
    personsDetected: Number(log.persons || 0),
    helmetsDetected: Number(log.helmets || 0),
    compliance: log.status !== "Violation",
    confidence: Number(log.confidence || 0),
    status: log.status,
    timestamp: log.timestamp,
    source: log.source || "image",
    processingMs: Number(log.processing_ms || 0),
    annotatedImage: log.annotated_image,
  });

  useEffect(() => {
    let isMounted = true;

    const hydrateResults = async () => {
      try {
        const payload = await fetchHelmetLogs({ page: 1, pageSize: 30 });
        if (!isMounted) {
          return;
        }
        const fromApi = (payload.logs || []).map(toDetectionResult);
        if (fromApi.length > 0) {
          setDetectionResults(fromApi);
          return;
        }
      } catch {
        // Fallback to browser cache when backend is unavailable.
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw || !isMounted) {
          return;
        }
        const parsed = JSON.parse(raw) as DetectionResult[];
        if (Array.isArray(parsed)) {
          setDetectionResults(parsed);
        }
      } catch {
        // Ignore malformed local cache.
      }
    };

    hydrateResults();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(detectionResults.slice(0, 100))
      );
    } catch {
      // Ignore storage quota or serialization errors.
    }
  }, [detectionResults]);

  const detectSingleImage = async (
    file: File,
    source: "image" | "camera"
  ): Promise<DetectionResult> => {
    const payload = await detectHelmet({
      file,
      source,
    });

    const data = payload.data;
    return {
      id: data.id,
      fileName: data.file_name || file.name,
      personsDetected: data.persons,
      helmetsDetected: data.helmets,
      compliance: Boolean(data.compliance),
      confidence: Number(data.confidence || 0),
      status: data.status,
      timestamp: data.timestamp,
      source: data.source || source,
      processingMs: Number(data.processing_ms || 0),
      annotatedImage: data.annotated_image,
    };
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const filesArray = Array.from(e.target.files);
    setUploadedImages((prev) => [...prev, ...filesArray]);
    setErrorMessage("");
    setIsDetecting(true);

    try {
      const settledResults = await Promise.allSettled(
        filesArray.map((file) => detectSingleImage(file, "image"))
      );

      const successResults = settledResults
        .filter(
          (result): result is PromiseFulfilledResult<DetectionResult> =>
            result.status === "fulfilled"
        )
        .map((result) => result.value);

      const failedCount = settledResults.filter(
        (result) => result.status === "rejected"
      ).length;

      if (failedCount > 0) {
        setErrorMessage(
          `${failedCount} image(s) could not be processed. Check backend logs/model path.`
        );
      }

      if (successResults.length > 0) {
        setDetectionResults((prev) => [...successResults, ...prev]);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error during helmet detection"
      );
    } finally {
      setIsDetecting(false);
      e.target.value = "";
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startCamera();
    } else {
      stopCamera();
    }
    setIsRecording(!isRecording);
  };

  const captureFrame = async () => {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setErrorMessage("Camera is not ready yet. Please try again.");
      return;
    }

    setIsDetecting(true);
    setErrorMessage("");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to capture camera frame");
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("Failed to create image from camera frame");
      }

      const fileName = `camera-capture-${Date.now()}.jpg`;
      const imageFile = new File([blob], fileName, { type: "image/jpeg" });
      const result = await detectSingleImage(imageFile, "camera");

      setDetectionResults((prev) => [result, ...prev]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Frame detection failed"
      );
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/helmet-detection"
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-700" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Helmet Detection Capture
            </h1>
            <p className="text-slate-600">
              Upload images or use live camera for helmet detection
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setCaptureMode("upload")}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
                captureMode === "upload"
                  ? "bg-linear-to-r from-orange-500 to-red-500 text-white shadow-lg"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Upload className="w-5 h-5 inline mr-2" />
              Upload Images
            </button>
            <button
              onClick={() => setCaptureMode("camera")}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
                captureMode === "camera"
                  ? "bg-linear-to-r from-orange-500 to-red-500 text-white shadow-lg"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Camera className="w-5 h-5 inline mr-2" />
              Live Camera
            </button>
          </div>

          {captureMode === "upload" && (
            <div>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 hover:border-orange-500 transition-colors cursor-pointer">
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
                  <Upload className="w-16 h-16 text-slate-400 mb-4" />
                  <p className="text-lg font-medium text-slate-700 mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-slate-500">
                    PNG, JPG or JPEG (Max 10MB each)
                  </p>
                </label>
              </div>

              {uploadedImages.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Uploaded: {uploadedImages.length} image(s)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {uploadedImages.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="relative group"
                      >
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-slate-200"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {captureMode === "camera" && (
            <div>
              <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!isRecording && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                    <p className="text-white text-lg">Camera not active</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-center gap-4">
                <button
                  onClick={toggleRecording}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium shadow-lg transition-all ${
                    isRecording
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-linear-to-r from-orange-500 to-red-500 hover:shadow-xl text-white"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-5 h-5" />
                      Stop Camera
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Start Camera
                    </>
                  )}
                </button>

                {isRecording && (
                  <button
                    onClick={captureFrame}
                    disabled={isDetecting}
                    className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium shadow-lg transition-all"
                  >
                    {isDetecting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    Capture Frame
                  </button>
                )}
              </div>
            </div>
          )}

          {isDetecting && (
            <p className="mt-4 text-sm text-orange-600 font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Running helmet detection...
            </p>
          )}

          {errorMessage && (
            <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
          )}
        </div>

        {detectionResults.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">
                Detection Results
              </h2>
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard/helmet-detection/logs"
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Open Logs
                </Link>
                <button
                  onClick={() => {
                    setDetectionResults([]);
                    localStorage.removeItem(STORAGE_KEY);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear Results
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {detectionResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  {result.annotatedImage ? (
                    <div
                      className="relative shrink-0 group cursor-pointer"
                      onClick={() => setLightboxSrc(result.annotatedImage!)}
                    >
                      <img
                        src={result.annotatedImage}
                        alt="Helmet detection"
                        className="w-24 h-16 object-cover rounded-lg border border-slate-200"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5 text-slate-400" />
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {result.fileName}
                    </p>
                    <p className="text-sm text-slate-600">
                      {result.personsDetected} person(s) •{" "}
                      {result.helmetsDetected} helmet(s) • Confidence:{" "}
                      {result.confidence.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {result.source} • {result.timestamp}
                      {result.processingMs > 0
                        ? ` • ${result.processingMs.toFixed(0)} ms`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                        result.compliance
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default HelmetImageCapturePage;
