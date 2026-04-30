import { useEffect, useRef, useState, useCallback } from "react";
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
import { getAuthSession } from "../../services/authSession";

type BoundingBox = {
  bbox: [number, number, number, number];
  label: string;
  confidence: number;
  type: string;
};

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
function drawBoxes(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  boxes: BoundingBox[],
  videoNaturalW: number,
  videoNaturalH: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!boxes.length || !videoNaturalW || !videoNaturalH) return;

  const scaleX = canvas.width / videoNaturalW;
  const scaleY = canvas.height / videoNaturalH;

  for (const det of boxes) {
    const [x1, y1, x2, y2] = det.bbox;
    const sx1 = x1 * scaleX;
    const sy1 = y1 * scaleY;
    const sw = (x2 - x1) * scaleX;
    const sh = (y2 - y1) * scaleY;

    // Determine if helmet based on type or label
    let isHelmet = false;
    if (det.type === "with_helmet") {
      isHelmet = true;
    } else if (det.type === "without_helmet") {
      isHelmet = false;
    } else {
      const labelLower = det.label.toLowerCase();
      isHelmet =
        labelLower.includes("helmet") ||
        labelLower.includes("hardhat") ||
        labelLower.includes("hard hat");
    }

    const color = isHelmet ? "#22c55e" : "#ef4444";

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx1, sy1, sw, sh);

    // FIX: Convert confidence from 0-1 to 0-100 for display
    // Backend returns confidence as 0-1 (e.g., 0.85 for 85%)
    const confidencePercent = Math.round(det.confidence * 100);

    const displayLabel = isHelmet ? "Helmet" : "No Helmet";
    const label = `${displayLabel} ${confidencePercent}%`;

    ctx.font = "bold 13px sans-serif";
    const textW = ctx.measureText(label).width;
    const textH = 18;
    const labelY = sy1 > textH + 4 ? sy1 - 4 : sy1 + sh + textH + 4;

    ctx.fillStyle = color;
    ctx.fillRect(sx1, labelY - textH, textW + 8, textH + 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, sx1 + 4, labelY - 3);
  }
}

function HelmetImageCapturePage() {
  const session = getAuthSession();
  const STORAGE_KEY = `helmetDetection.captureResults.v1.${
    session?.organizationId || "global"
  }`;
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>(
    []
  );
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<{
    status: string;
    persons: number;
    helmets: number;
    no_helmet: number;
    confidence: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  // Detection loop state — use refs so the rAF loop sees latest values
  const isDetectingRef = useRef(false); // is an API call in-flight?
  const isRunningRef = useRef(false); // should the loop keep going?
  const currentBoxesRef = useRef<BoundingBox[]>([]);
  const videoNaturalSize = useRef({ w: 0, h: 0 });

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
        if (!isMounted) return;
        const fromApi = (payload.logs || []).map(toDetectionResult);
        if (fromApi.length > 0) {
          setDetectionResults(fromApi);
          return;
        }
      } catch {
        /* fallback */
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw || !isMounted) return;
        const parsed = JSON.parse(raw) as DetectionResult[];
        if (Array.isArray(parsed)) setDetectionResults(parsed);
      } catch {
        /* ignore */
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
      /* ignore */
    }
  }, [detectionResults]);

  // ── rAF loop: draws boxes every frame, fires API call when previous one done ──
  // ── rAF loop: draws boxes every frame, fires API call when previous one done ──
  const renderLoop = useCallback(() => {
    if (!isRunningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      drawBoxes(
        canvas,
        video,
        currentBoxesRef.current,
        videoNaturalSize.current.w,
        videoNaturalSize.current.h
      );

      // Fire a new detection only when the previous API call has finished
      if (!isDetectingRef.current) {
        isDetectingRef.current = true;

        // Capture frame at reduced resolution for speed (640px wide)
        const offscreen = document.createElement("canvas");
        const scale = Math.min(1, 640 / video.videoWidth);
        offscreen.width = Math.round(video.videoWidth * scale);
        offscreen.height = Math.round(video.videoHeight * scale);
        const octx = offscreen.getContext("2d");
        if (octx) {
          octx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
          offscreen.toBlob(
            (blob) => {
              if (!blob || !isRunningRef.current) {
                isDetectingRef.current = false;
                return;
              }
              const file = new File([blob], "stream-frame.jpg", {
                type: "image/jpeg",
              });
              detectHelmet({ file, source: "camera" })
                .then((payload) => {
                  if (!isRunningRef.current) return;
                  const d = payload.data;

                  // DEBUG: Log confidence values
                  if (d.detections && d.detections.length > 0) {
                    console.log("Sample detection:", {
                      label: d.detections[0].label,
                      confidence_raw: d.detections[0].confidence,
                      confidence_percent: Math.round(
                        d.detections[0].confidence * 100
                      ),
                    });
                  }

                  // Process detections
                  const processedDetections = (d.detections ?? []).map(
                    (det) => ({
                      bbox: det.bbox as [number, number, number, number],
                      label: det.label,
                      confidence: Number(det.confidence), // Keep as 0-1
                      type:
                        det.type ||
                        (det.label?.toLowerCase().includes("helmet")
                          ? "with_helmet"
                          : "without_helmet"),
                    })
                  );

                  currentBoxesRef.current = processedDetections.filter(
                    (det): det is BoundingBox =>
                      Array.isArray(det.bbox) && det.bbox.length === 4
                  );

                  videoNaturalSize.current = {
                    w: offscreen.width,
                    h: offscreen.height,
                  };
                  setLiveStatus({
                    status: d.status,
                    persons: d.persons,
                    helmets: d.helmets,
                    no_helmet: d.no_helmet ?? 0,
                    confidence: Number(d.confidence ?? 0),
                  });
                })
                .catch((err) => {
                  console.error("Detection error:", err);
                })
                .finally(() => {
                  isDetectingRef.current = false;
                });
            },
            "image/jpeg",
            0.75
          );
        } else {
          isDetectingRef.current = false;
        }
      }
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoNaturalSize.current = {
            w: videoRef.current!.videoWidth,
            h: videoRef.current!.videoHeight,
          };
        };
      }
      isRunningRef.current = true;
      isDetectingRef.current = false;
      currentBoxesRef.current = [];
      rafRef.current = requestAnimationFrame(renderLoop);
      setIsRecording(true);
    } catch (err) {
      console.error("Camera error:", err);
      setErrorMessage("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    isRunningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    currentBoxesRef.current = [];
    setIsRecording(false);
    setLiveStatus(null);
  };

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  const detectSingleImage = async (
    file: File,
    source: "image" | "camera"
  ): Promise<DetectionResult> => {
    const payload = await detectHelmet({ file, source });
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
    if (!e.target.files || e.target.files.length === 0) return;
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
          (r): r is PromiseFulfilledResult<DetectionResult> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
      const failedCount = settledResults.filter(
        (r) => r.status === "rejected"
      ).length;
      if (failedCount > 0)
        setErrorMessage(`${failedCount} image(s) could not be processed.`);
      if (successResults.length > 0)
        setDetectionResults((prev) => [...successResults, ...prev]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error during helmet detection"
      );
    } finally {
      setIsDetecting(false);
      e.target.value = "";
    }
  };

  const statusColor =
    liveStatus?.status === "Compliant"
      ? "bg-green-500"
      : liveStatus?.status === "Violation"
      ? "bg-red-500"
      : "bg-slate-500";

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
              onClick={() => {
                if (isRecording) stopCamera();
                setCaptureMode("upload");
              }}
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
              {/* Video + canvas overlay stacked */}
              <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Canvas sits on top of video, pointer-events:none so video controls work */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: "none" }}
                />
                {!isRecording && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                    <p className="text-white text-lg">Camera not active</p>
                  </div>
                )}
                {/* Live status badge */}
                {isRecording && liveStatus && (
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold text-white ${statusColor}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                      {liveStatus.status}
                    </span>
                    <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                      {liveStatus.persons}P · {liveStatus.helmets}✓ ·{" "}
                      {liveStatus.no_helmet}✗ ·{" "}
                      {liveStatus.confidence.toFixed(0)}%
                    </span>
                  </div>
                )}
                {/* Scanning indicator when no result yet */}
                {isRecording && !liveStatus && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Scanning...
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={isRecording ? stopCamera : startCamera}
                  className={`flex items-center gap-2 px-8 py-3 rounded-lg font-medium shadow-lg transition-all ${
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
                      {result.personsDetected} person(s) ·{" "}
                      {result.helmetsDetected} helmet(s) · Confidence:{" "}
                      {result.confidence.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {result.source} · {result.timestamp}
                      {result.processingMs > 0
                        ? ` · ${result.processingMs.toFixed(0)} ms`
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
