import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { Link } from "react-router";
import {
  detectMaskImage,
  detectMaskStream,
  fetchMaskLogs,
} from "../../services/maskApi";
import type { MaskLog } from "../../services/maskApi";

type DetectionResult = MaskLog & {
  annotated_image?: string;
  compliance: boolean;
};

type BboxDetection = {
  label: string;
  type: string;
  confidence: number;
  bbox: number[] | null;
};

type LiveSummary = {
  persons: number;
  masked: number;
  violations: number;
  status: string;
};

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-2xl font-bold"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={src}
        alt="Detection"
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Compliant"
      ? "bg-green-100 text-green-700"
      : status === "Non-Compliant"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}
    >
      {status}
    </span>
  );
}

// Optimized bounding box drawing with requestAnimationFrame smoothing
function drawBboxes(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  detections: BboxDetection[],
  interpolated: boolean = false
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  if (canvas.width !== vw || canvas.height !== vh) {
    canvas.width = vw;
    canvas.height = vh;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Use semi-transparent clear for smoother transitions
  ctx.clearRect(0, 0, vw, vh);

  for (const det of detections) {
    if (!det.bbox || det.bbox.length !== 4) continue;
    const [x1, y1, x2, y2] = det.bbox;
    const t = det.type || det.label || "";

    let color: string, label: string;
    if (t.includes("with_mask")) {
      color = "#22c55e";
      label = "✓ Mask";
    } else if (t.includes("without")) {
      color = "#ef4444";
      label = "✗ No Mask";
    } else if (t.includes("incorrect")) {
      color = "#f59e0b";
      label = "⚠ Incorrect";
    } else {
      color = "#3b82f6";
      label = "Face";
    }

    // Confidence is already a percentage (0-100)
    const conf = Math.round(det.confidence || 0);
    const text = `${label} ${conf}%`;

    // Draw bounding box with slightly thicker line for visibility
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Draw label with background
    ctx.font = "bold 14px 'Segoe UI', monospace";
    const tw = ctx.measureText(text).width;
    const lh = 24;
    const ly = y1 - lh - 4 < 0 ? y2 + 4 : y1 - lh - 4;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x1, ly, tw + 12, lh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x1 + 6, ly + 17);

    // Add a subtle pulsing effect for violations
    if (t.includes("without") || t.includes("incorrect")) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x1 - 2, y1 - 2, x2 - x1 + 4, y2 - y1 + 4);
      ctx.setLineDash([]);
    }
  }

  // Draw mini status in corner
  if (detections.length > 0) {
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, vh - 22, 70, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `${detections.length} face${detections.length > 1 ? "s" : ""}`,
      12,
      vh - 9
    );
  }
}

export default function MaskImageCapturePage() {
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("camera");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [liveSummary, setLiveSummary] = useState<LiveSummary>({
    persons: 0,
    masked: 0,
    violations: 0,
    status: "No Persons Detected",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvas = useRef<HTMLCanvasElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);

  const isStreamingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const latestDets = useRef<BboxDetection[]>([]);
  const rafRef = useRef<number | null>(null);
  const detectionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // For smoothing - track previous detections
  const prevDets = useRef<BboxDetection[]>([]);
  const lastUpdateTime = useRef(0);
  const UPDATE_INTERVAL_MS = 100; // 10 FPS detection (more frequent than before)

  // High FPS render loop - runs at 60fps
  const renderLoop = useCallback(() => {
    if (!isStreamingRef.current) return;

    const video = videoRef.current;
    const ol = overlayCanvas.current;

    if (video && ol && video.readyState === 4 && video.videoWidth > 0) {
      // Always draw the latest detections at 60fps
      drawBboxes(ol, video, latestDets.current);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // Optimized detection - runs on a separate interval but doesn't block rendering
  const runDetection = useCallback(async () => {
    if (!isStreamingRef.current) return;

    const video = videoRef.current;
    const canvas = captureCanvas.current;
    if (!video || !canvas || video.readyState !== 4 || video.videoWidth === 0) {
      return;
    }

    // Use a smaller resolution for faster inference
    const targetW = 320;
    const scale = targetW / video.videoWidth;
    canvas.width = targetW;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameB64 = canvas.toDataURL("image/jpeg", 0.6); // Slightly lower quality for speed

    const t0 = performance.now();
    try {
      const res = await detectMaskStream(frameB64, "cam_01", "Live Camera");
      const latency = performance.now() - t0;

      if (res?.data) {
        const d = res.data as any;
        const upScale = 1 / scale;

        // Scale bboxes back to native video resolution
        const newDetections = (d.detections ?? []).map((det: any) => ({
          label: det.label ?? "",
          type: det.type ?? "",
          confidence: det.confidence ?? 0,
          bbox:
            det.bbox?.length === 4
              ? det.bbox.map((v: number) => Math.round(v * upScale))
              : null,
        }));

        // Smooth update - only replace if significant change
        const hasChange =
          JSON.stringify(newDetections) !== JSON.stringify(latestDets.current);
        if (hasChange || performance.now() - lastUpdateTime.current > 500) {
          latestDets.current = newDetections;
          lastUpdateTime.current = performance.now();
        }

        const summary: LiveSummary = {
          persons: d.persons ?? 0,
          masked: d.masked ?? 0,
          violations: (d.without_mask ?? 0) + (d.incorrect ?? 0),
          status: d.status ?? "No Persons Detected",
        };
        setLiveSummary(summary);

        // Only log unique events (avoid duplicates)
        if (d.status !== "No Persons Detected") {
          const result: DetectionResult = {
            id: d.id ?? Date.now(),
            timestamp: d.timestamp ?? new Date().toISOString(),
            persons: d.persons ?? 0,
            masked: d.masked ?? 0,
            without_mask: d.without_mask ?? 0,
            incorrect: d.incorrect ?? 0,
            status: d.status ?? "No Persons Detected",
            confidence: d.confidence ?? 0,
            file_name: d.file_name ?? "stream_cam_01",
            source: d.source ?? "stream",
            camera_id: d.camera_id ?? "cam_01",
            processing_ms: d.processing_ms ?? Math.round(latency),
            annotated_image: d.annotated_image,
            compliance: d.compliance ?? false,
          };

          setResults((prev) => {
            const key = `${result.status}|${result.persons}`;
            const last = prev[0];
            if (
              last &&
              last.status === result.status &&
              Math.abs(
                new Date(last.timestamp).getTime() -
                  new Date(result.timestamp).getTime()
              ) < 2000
            ) {
              return prev; // Skip duplicate
            }
            return [result, ...prev].slice(0, 200);
          });
        }
      }
    } catch (err) {
      // Silent fail - don't spam console
    }
  }, []);

  const startCamera = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res, rej) => {
          const v = videoRef.current!;
          const t = setTimeout(() => rej(new Error("Timeout")), 10000);
          v.onloadedmetadata = () => {
            clearTimeout(t);
            v.play().then(res).catch(rej);
          };
          v.onerror = () => rej(new Error("Video error"));
        });
      }
      return true;
    } catch (err) {
      setErrorMessage(
        `Camera error: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  };

  const stopCamera = useCallback(() => {
    isStreamingRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (overlayCanvas.current) {
      const ctx = overlayCanvas.current.getContext("2d");
      ctx?.clearRect(
        0,
        0,
        overlayCanvas.current.width,
        overlayCanvas.current.height
      );
    }

    latestDets.current = [];
    setLiveSummary({
      persons: 0,
      masked: 0,
      violations: 0,
      status: "No Persons Detected",
    });
    setIsStreaming(false);
  }, []);

  const startStreaming = async () => {
    if (!(await startCamera())) return;

    isStreamingRef.current = true;
    setIsStreaming(true);

    // Start render loop (60fps)
    rafRef.current = requestAnimationFrame(renderLoop);

    // Start detection every 150ms (~7 FPS detection - smooth enough)
    detectionInterval.current = setInterval(() => {
      runDetection();
    }, 150);

    // Run first detection immediately
    setTimeout(() => runDetection(), 100);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setErrorMessage("");
    setIsProcessing(true);
    try {
      const responses = await Promise.all(
        Array.from(e.target.files).map((f) => detectMaskImage(f, "Upload"))
      );
      setResults((prev) => [
        ...responses.map((r) => ({ ...r.data, compliance: r.data.compliance })),
        ...prev,
      ]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setIsProcessing(false);
      (document.getElementById("mask-upload") as HTMLInputElement).value = "";
    }
  };

  useEffect(() => {
    fetchMaskLogs({ page: 1, pageSize: 100 })
      .then((p) =>
        setResults(
          (p.logs || []).map((l) => ({
            ...l,
            compliance: l.status === "Compliant",
          }))
        )
      )
      .catch(() => setErrorMessage("Could not load previous logs."));
  }, []);

  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (detectionInterval.current) clearInterval(detectionInterval.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/mask-detection"
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-700" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Mask Detection Capture
            </h1>
            <p className="text-slate-600">
              Upload images or use live camera for real-time mask detection
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <div className="flex gap-4 mb-6">
            {(["upload", "camera"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (isStreaming) stopCamera();
                  setCaptureMode(mode);
                  setErrorMessage("");
                }}
                className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
                  captureMode === mode
                    ? "bg-teal-500 text-white shadow-lg"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {mode === "upload" ? "Upload Images" : "Live Camera"}
              </button>
            ))}
          </div>

          {captureMode === "upload" && (
            <label
              htmlFor="mask-upload"
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 hover:border-teal-500 transition-colors cursor-pointer flex flex-col items-center"
            >
              <input
                id="mask-upload"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {isProcessing ? (
                <>
                  <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-teal-600 font-medium">Detecting…</p>
                </>
              ) : (
                <>
                  <Upload className="w-xl h-5 inline mr-2" />
                  <p className="text-lg font-medium text-slate-700 mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-slate-500">PNG, JPG, JPEG</p>
                </>
              )}
            </label>
          )}

          {captureMode === "camera" && (
            <div className="space-y-4">
              <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <canvas
                  ref={overlayCanvas}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />

                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                    <p className="text-white text-lg font-medium">
                      Click "Start Camera" to begin
                    </p>
                  </div>
                )}

                {isStreaming && (
                  <>
                    <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-white text-xs font-mono uppercase tracking-widest">
                        LIVE
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 bg-black/60 rounded-lg px-3 py-2 text-xs font-mono text-white space-x-3">
                      <span className="text-green-400">
                        ✓{liveSummary.masked}
                      </span>
                      <span
                        className={
                          liveSummary.violations > 0
                            ? "text-red-400"
                            : "text-slate-400"
                        }
                      >
                        ✗{liveSummary.violations}
                      </span>
                      <span className="text-cyan-400">
                        P:{liveSummary.persons}
                      </span>
                    </div>
                    <div className="absolute top-3 left-3 bg-black/60 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-300">
                      {liveSummary.status === "Compliant"
                        ? "✓ COMPLIANT"
                        : liveSummary.status === "Non-Compliant"
                        ? "⚠ VIOLATION"
                        : "○ NO PERSONS"}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() =>
                    isStreaming ? stopCamera() : startStreaming()
                  }
                  className={`px-8 py-3 rounded-lg font-medium shadow-lg transition-all ${
                    isStreaming
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-teal-500 hover:bg-teal-600 text-white"
                  }`}
                >
                  {isStreaming ? "Stop Camera" : "Start Camera"}
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-800">Real-time detection</p>
                <p className="text-xs text-blue-600 mt-1">
                  <span className="text-green-600 font-semibold">Green</span>:
                  Proper mask |
                  <span className="text-red-600 font-semibold ml-1">Red</span>:
                  No mask (violation)
                </p>
              </div>
            </div>
          )}

          <canvas ref={captureCanvas} className="hidden" />

          {errorMessage && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
              {errorMessage}
            </p>
          )}
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Detection Log
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {results.length} events recorded
                </p>
              </div>
              <button
                onClick={() => setResults([])}
                className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Clear
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {results.map((r, idx) => (
                <div
                  key={`${r.id}-${idx}`}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() =>
                    r.annotated_image && setLightboxSrc(r.annotated_image)
                  }
                >
                  {r.annotated_image ? (
                    <img
                      src={r.annotated_image}
                      alt="Detection"
                      className="w-24 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-slate-400 text-xs">No preview</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {r.file_name || `Event at ${r.timestamp}`}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Persons: {r.persons} · Masked: {r.masked} · Violations:{" "}
                      {(r.without_mask ?? 0) + (r.incorrect ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.source} · {new Date(r.timestamp).toLocaleTimeString()}{" "}
                      · {r.processing_ms}ms
                    </p>
                  </div>

                  <div className="text-right space-y-1 shrink-0">
                    <StatusBadge status={r.status} />
                    <p className="text-xs text-slate-400">
                      {Number(r.confidence).toFixed(1)}% confidence
                    </p>
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
