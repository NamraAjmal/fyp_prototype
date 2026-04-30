import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft,
  Camera,
  Upload,
  Play,
  Square,
  RotateCcw,
  XCircle,
  Loader2,
} from "lucide-react";
import { Link } from "react-router";
import { buildAuthHeaders } from "../../services/authSession";

const API_BASE = "http://127.0.0.1:5000";

interface FaceResult {
  bbox: [number, number, number, number];
  confidence: number;
  matched: boolean;
  name: string;
  cnic: string | null;
  similarity: number | null;
}

interface DetectionResult {
  id: number;
  fileName: string;
  totalFaces: number;
  matched: number;
  unmatched: number;
  faces: FaceResult[];
  annotatedImage: string;
  timestamp: string;
}

interface FaceDetectionPayload {
  total_faces: number;
  matched: number;
  unmatched: number;
  faces: FaceResult[];
  annotated_image?: string;
}

function toDetectionResult(
  data: FaceDetectionPayload,
  fileName: string
): DetectionResult {
  return {
    id: Date.now() + Math.random(),
    fileName,
    totalFaces: data.total_faces,
    matched: data.matched,
    unmatched: data.unmatched,
    faces: data.faces || [],
    annotatedImage: data.annotated_image || "",
    timestamp: new Date().toLocaleTimeString(),
  };
}

function getRecognitionStatus(result: DetectionResult) {
  if (result.totalFaces === 0) {
    return {
      label: "No Faces",
      className: "bg-slate-100 text-slate-600",
    };
  }

  if (result.matched > 0 && result.unmatched === 0) {
    return {
      label: "Matched",
      className: "bg-green-100 text-green-700",
    };
  }

  if (result.matched === 0 && result.unmatched > 0) {
    return {
      label: "Unknown",
      className: "bg-yellow-100 text-yellow-700",
    };
  }

  return {
    label: "Mixed",
    className: "bg-blue-100 text-blue-700",
  };
}

function buildFaceSummary(result: DetectionResult) {
  const matchedNames = result.faces
    .filter((face) => face.matched)
    .map((face) => face.name)
    .filter(Boolean);

  if (matchedNames.length > 0) {
    return matchedNames.slice(0, 2).join(", ");
  }

  if (result.totalFaces === 0) {
    return "No faces detected";
  }

  return "Unknown resident(s)";
}

function FaceImageCapturePage() {
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>(
    []
  );
  const [streamResult, setStreamResult] = useState<DetectionResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (streamTimer.current) {
        clearInterval(streamTimer.current);
      }
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setError(null);
    setIsProcessing(true);

    const files = Array.from(e.target.files);

    for (const file of files) {
      const formData = new FormData();
      formData.append("image", file);

      try {
        const res = await fetch(`${API_BASE}/recognize-face`, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: formData,
        });
        const result = await res.json();

        if (result.status === "success") {
          const nextResult = toDetectionResult(result.data, file.name);
          setDetectionResults((prev) => [nextResult, ...prev]);
        } else {
          setError(`Error on ${file.name}: ${result.message}`);
        }
      } catch {
        setError(`Failed to process ${file.name}. Is the backend running?`);
      }
    }

    setIsProcessing(false);
    e.target.value = "";
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsStreaming(true);
      setError(null);
      streamTimer.current = setInterval(captureAndSend, 1500);
    } catch {
      setError("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamTimer.current) {
      clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setStreamResult(null);
  };

  const captureAndSend = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const frame = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const res = await fetch(`${API_BASE}/recognize-face-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({ frame }),
      });
      const result = await res.json();

      if (result.status === "success") {
        setStreamResult(toDetectionResult(result.data, "live-stream"));
      }
    } catch {
      // Ignore stream failures to avoid spamming the UI.
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/face-detection"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Image & Camera Capture
          </h1>
          <p className="text-slate-600">
            Upload images or use live camera for face recognition
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            x
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex gap-4 mb-6">
          {(["upload", "camera"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setCaptureMode(mode);
                if (isStreaming) {
                  stopCamera();
                }
              }}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
                captureMode === mode
                  ? "bg-linear-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {mode === "upload" ? (
                <>
                  <Upload className="w-5 h-5 inline mr-2" />
                  Upload Images
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 inline mr-2" />
                  Live Camera
                </>
              )}
            </button>
          ))}
        </div>

        {captureMode === "upload" && (
          <div>
            <div
              className={`border-2 border-dashed rounded-lg p-12 transition-colors ${
                isProcessing
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-300 hover:border-blue-500"
              }`}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
                disabled={isProcessing}
              />
              <label
                htmlFor="image-upload"
                className={`flex flex-col items-center ${
                  isProcessing ? "cursor-wait" : "cursor-pointer"
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="w-16 h-16 text-blue-400 mb-4 animate-spin" />
                ) : (
                  <Upload className="w-16 h-16 text-slate-400 mb-4" />
                )}
                <p className="text-lg font-medium text-slate-700 mb-2">
                  {isProcessing
                    ? "Processing..."
                    : "Click to upload or drag and drop"}
                </p>
                <p className="text-sm text-slate-500">
                  PNG, JPG or JPEG - faces will be identified against enrolled
                  residents
                </p>
              </label>
            </div>
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
              <canvas ref={canvasRef} className="hidden" />

              {isStreaming && streamResult && streamResult.annotatedImage && (
                <img
                  src={streamResult.annotatedImage}
                  alt="annotated"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                  <p className="text-white text-lg">Camera not active</p>
                </div>
              )}

              {isStreaming && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              )}

              {isStreaming && streamResult && (
                <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                  <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                    Faces: {streamResult.totalFaces}
                  </span>
                  <span className="bg-green-500/80 text-white text-xs px-3 py-1 rounded-full">
                    {streamResult.matched} matched
                  </span>
                  {streamResult.unmatched > 0 && (
                    <span className="bg-yellow-500/80 text-white text-xs px-3 py-1 rounded-full">
                      {streamResult.unmatched} unknown
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={isStreaming ? stopCamera : startCamera}
                className={`flex items-center gap-2 px-8 py-3 rounded-lg font-medium shadow-lg transition-all ${
                  isStreaming
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-linear-to-r from-blue-500 to-cyan-500 text-white hover:shadow-xl"
                }`}
              >
                {isStreaming ? (
                  <>
                    <Square className="w-5 h-5" />
                    Stop Recognition
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Start Live Recognition
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {detectionResults.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">
              Detection Results
            </h2>
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard/face-detection/logs"
                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Open Logs
              </Link>
              <button
                onClick={() => setDetectionResults([])}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Clear Logs
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {detectionResults.map((result) => {
              const status = getRecognitionStatus(result);
              const summary = buildFaceSummary(result);
              const identifiedCount = result.faces.filter(
                (face) => face.matched
              ).length;

              return (
                <div
                  key={result.id}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
                >
                  {result.annotatedImage ? (
                    <img
                      src={result.annotatedImage}
                      alt="Recognition result"
                      className="w-24 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Camera className="w-6 h-6 text-slate-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {result.fileName}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {result.totalFaces} face(s) · {result.matched} matched ·{" "}
                      {result.unmatched} unknown
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {summary} · {result.timestamp}
                    </p>
                  </div>

                  <div className="text-right space-y-1 shrink-0">
                    <span
                      className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${status.className}`}
                    >
                      {status.label}
                    </span>
                    <p className="text-xs text-slate-400">
                      {identifiedCount > 0
                        ? `${identifiedCount} identified`
                        : "No matches"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default FaceImageCapturePage;
