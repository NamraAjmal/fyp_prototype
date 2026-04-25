// import { useEffect, useRef, useState, useCallback } from "react";
// import {
//   ArrowLeft,
//   Camera,
//   Upload,
//   Play,
//   Square,
//   RotateCcw,
//   Loader2,
//   ZoomIn,
//   X,
// } from "lucide-react";
// import { Link } from "react-router";
// import {
//   detectMaskImage,
//   detectMaskStream,
//   fetchMaskLogs,
// } from "../../services/maskApi";
// import type { MaskLog } from "../../services/maskApi";

// type DetectionResult = MaskLog & {
//   annotated_image?: string;
//   compliance: boolean;
// };

// // ── Lightbox ─────────────────────────────────────────────────────────────────
// function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, [onClose]);

//   return (
//     <div
//       className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
//       onClick={onClose}
//     >
//       <button
//         className="absolute top-4 right-4 text-white hover:text-slate-300"
//         onClick={onClose}
//       >
//         <X className="w-8 h-8" />
//       </button>
//       <img
//         src={src}
//         alt="Annotated detection"
//         className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
//         onClick={(e) => e.stopPropagation()}
//       />
//     </div>
//   );
// }

// // ── Status badge ──────────────────────────────────────────────────────────────
// function StatusBadge({ status }: { status: string }) {
//   const cls =
//     status === "Compliant"
//       ? "bg-green-100 text-green-700"
//       : status === "Non-Compliant"
//       ? "bg-red-100 text-red-700"
//       : "bg-slate-100 text-slate-600";
//   return (
//     <span
//       className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}
//     >
//       {status}
//     </span>
//   );
// }

// // ── Main component ─────────────────────────────────────────────────────────────
// function MaskImageCapturePage() {
//   const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
//   const [isStreaming, setIsStreaming] = useState(false);
//   const [isSaving, setIsSaving] = useState(false);
//   const [results, setResults] = useState<DetectionResult[]>([]);
//   const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
//   const [errorMessage, setErrorMessage] = useState("");
//   const [streamResult, setStreamResult] = useState<DetectionResult | null>(
//     null
//   );

//   const videoRef = useRef<HTMLVideoElement>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const streamRef = useRef<number | null>(null);
//   const isDetectingRef = useRef(false);

//   // Load previous logs on mount
//   useEffect(() => {
//     fetchMaskLogs({ page: 1, pageSize: 50 })
//       .then((payload) =>
//         setResults(
//           (payload.logs || []).map((l) => ({
//             ...l,
//             compliance: l.status === "Compliant",
//           }))
//         )
//       )
//       .catch(() => setErrorMessage("Could not load previous logs."));
//   }, []);

//   // ── Image upload → real detection ──────────────────────────────────────────
//   const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//     if (!e.target.files?.length) return;
//     const files = Array.from(e.target.files);
//     setErrorMessage("");
//     setIsSaving(true);

//     try {
//       const responses = await Promise.all(
//         files.map((file) => detectMaskImage(file, "Upload"))
//       );
//       const newResults: DetectionResult[] = responses.map((r) => ({
//         ...r.data,
//         compliance: r.data.compliance,
//         annotated_image: r.data.annotated_image,
//       }));
//       setResults((prev) => [...newResults, ...prev]);
//     } catch (err) {
//       setErrorMessage(err instanceof Error ? err.message : "Detection failed");
//     } finally {
//       setIsSaving(false);
//       e.target.value = "";
//     }
//   };

//   // ── Camera streaming ────────────────────────────────────────────────────────
//   const startCamera = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ video: true });
//       if (videoRef.current) videoRef.current.srcObject = stream;
//       return true;
//     } catch {
//       setErrorMessage("Could not access camera. Check permissions.");
//       return false;
//     }
//   };

//   const stopCamera = () => {
//     if (streamRef.current) clearInterval(streamRef.current);
//     streamRef.current = null;
//     if (videoRef.current?.srcObject) {
//       (videoRef.current.srcObject as MediaStream)
//         .getTracks()
//         .forEach((t) => t.stop());
//       videoRef.current.srcObject = null;
//     }
//     setStreamResult(null);
//   };

//   // Capture one frame from video, send to backend, overlay result
//   const captureAndDetect = useCallback(async () => {
//     if (!videoRef.current || !canvasRef.current || isDetectingRef.current)
//       return;

//     isDetectingRef.current = true;

//     try {
//       const video = videoRef.current;
//       const canvas = canvasRef.current;
//       canvas.width = video.videoWidth || 640;
//       canvas.height = video.videoHeight || 480;
//       const ctx = canvas.getContext("2d");
//       if (!ctx) return;
//       ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
//       const frameB64 = canvas.toDataURL("image/jpeg", 0.8);

//       const res = await detectMaskStream(frameB64, "cam_01", "Live Camera");
//       const result: DetectionResult = {
//         ...(res.data as MaskLog),
//         compliance: res.data.compliance,
//         annotated_image: res.data.annotated_image,
//       };
//       setStreamResult(result);
//       // Only add to history list on non-compliant
//       if (!result.compliance) {
//         setResults((prev) => [result, ...prev].slice(0, 100));
//       }
//     } catch {
//       // silently ignore stream errors to avoid spamming UI
//     } finally {
//       isDetectingRef.current = false;
//     }
//   }, []);

//   const toggleStreaming = () => {
//     if (!isStreaming) {
//       startCamera().then((started) => {
//         if (!started) return;
//         // send a frame every 1.5 s
//         streamRef.current = setInterval(captureAndDetect, 1500);
//         setIsStreaming(true);
//       });
//     } else {
//       stopCamera();
//       setIsStreaming(false);
//     }
//   };

//   // Manual single capture
//   const captureOnce = async () => {
//     setIsSaving(true);
//     await captureAndDetect();
//     setIsSaving(false);
//   };

//   // Cleanup on unmount
//   useEffect(() => () => stopCamera(), []);

//   return (
//     <>
//       {lightboxSrc && (
//         <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
//       )}

//       <div className="space-y-6">
//         {/* Header */}
//         <div className="flex items-center gap-4">
//           <Link
//             to="/dashboard/mask-detection"
//             className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
//           >
//             <ArrowLeft className="w-6 h-6 text-slate-700" />
//           </Link>
//           <div>
//             <h1 className="text-3xl font-bold text-slate-800">
//               Mask Detection Capture
//             </h1>
//             <p className="text-slate-600">
//               Upload images or use live camera for real-time mask detection
//             </p>
//           </div>
//         </div>

//         {/* Mode switcher + input */}
//         <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
//           <div className="flex gap-4 mb-6">
//             {(["upload", "camera"] as const).map((mode) => (
//               <button
//                 key={mode}
//                 onClick={() => {
//                   if (isStreaming) {
//                     stopCamera();
//                     setIsStreaming(false);
//                   }
//                   setCaptureMode(mode);
//                 }}
//                 className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all capitalize ${
//                   captureMode === mode
//                     ? "bg-linear-to-r from-teal-500 to-green-500 text-white shadow-lg"
//                     : "bg-slate-100 text-slate-700 hover:bg-slate-200"
//                 }`}
//               >
//                 {mode === "upload" ? (
//                   <>
//                     <Upload className="w-5 h-5 inline mr-2" />
//                     Upload Images
//                   </>
//                 ) : (
//                   <>
//                     <Camera className="w-5 h-5 inline mr-2" />
//                     Live Camera
//                   </>
//                 )}
//               </button>
//             ))}
//           </div>

//           {/* Upload mode */}
//           {captureMode === "upload" && (
//             <div>
//               <label
//                 htmlFor="mask-upload"
//                 className="border-2 border-dashed border-slate-300 rounded-xl p-12 hover:border-teal-500 transition-colors cursor-pointer flex flex-col items-center"
//               >
//                 <input
//                   id="mask-upload"
//                   type="file"
//                   multiple
//                   accept="image/*"
//                   onChange={handleImageUpload}
//                   className="hidden"
//                 />
//                 {isSaving ? (
//                   <>
//                     <Loader2 className="w-12 h-12 text-teal-500 animate-spin mb-3" />
//                     <p className="text-teal-600 font-medium">
//                       Detecting masks…
//                     </p>
//                   </>
//                 ) : (
//                   <>
//                     <Upload className="w-16 h-16 text-slate-400 mb-4" />
//                     <p className="text-lg font-medium text-slate-700 mb-1">
//                       Click to upload or drag and drop
//                     </p>
//                     <p className="text-sm text-slate-500">
//                       PNG, JPG, JPEG (max 10 MB each)
//                     </p>
//                   </>
//                 )}
//               </label>
//             </div>
//           )}

//           {/* Camera mode */}
//           {captureMode === "camera" && (
//             <div className="space-y-4">
//               {/* Video feed — shows annotated frame when streaming */}
//               <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
//                 <video
//                   ref={videoRef}
//                   autoPlay
//                   playsInline
//                   muted
//                   className={`w-full h-full object-cover ${
//                     streamResult?.annotated_image ? "hidden" : ""
//                   }`}
//                 />
//                 {/* Overlay annotated frame on top of raw video */}
//                 {streamResult?.annotated_image && (
//                   <img
//                     src={streamResult.annotated_image}
//                     alt="Annotated frame"
//                     className="absolute inset-0 w-full h-full object-cover"
//                   />
//                 )}
//                 {!isStreaming && (
//                   <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
//                     <p className="text-white text-lg">Camera not active</p>
//                   </div>
//                 )}
//                 {/* Live status overlay */}
//                 {isStreaming && streamResult && (
//                   <div className="absolute top-3 left-3">
//                     <StatusBadge status={streamResult.status} />
//                   </div>
//                 )}
//                 {isStreaming && (
//                   <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1">
//                     <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
//                     <span className="text-white text-xs font-medium">LIVE</span>
//                   </div>
//                 )}
//               </div>

//               {/* Live detection stats */}
//               {isStreaming && streamResult && (
//                 <div className="grid grid-cols-3 gap-3">
//                   {[
//                     { label: "Persons", value: streamResult.persons },
//                     { label: "Masked", value: streamResult.masked },
//                     {
//                       label: "Violations",
//                       value:
//                         (streamResult.without_mask ?? 0) +
//                         (streamResult.incorrect ?? 0),
//                     },
//                   ].map(({ label, value }) => (
//                     <div
//                       key={label}
//                       className="bg-slate-50 rounded-lg p-3 text-center"
//                     >
//                       <p className="text-2xl font-bold text-slate-800">
//                         {value}
//                       </p>
//                       <p className="text-xs text-slate-500 mt-0.5">{label}</p>
//                     </div>
//                   ))}
//                 </div>
//               )}

//               <div className="flex justify-center gap-4">
//                 <button
//                   onClick={toggleStreaming}
//                   className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium shadow-lg transition-all ${
//                     isStreaming
//                       ? "bg-red-500 hover:bg-red-600 text-white"
//                       : "bg-linear-to-r from-teal-500 to-green-500 text-white hover:shadow-xl"
//                   }`}
//                 >
//                   {isStreaming ? (
//                     <>
//                       <Square className="w-5 h-5" />
//                       Stop Camera
//                     </>
//                   ) : (
//                     <>
//                       <Play className="w-5 h-5" />
//                       Start Camera
//                     </>
//                   )}
//                 </button>
//                 {isStreaming && (
//                   <button
//                     onClick={captureOnce}
//                     disabled={isSaving}
//                     className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium shadow-lg"
//                   >
//                     {isSaving ? (
//                       <Loader2 className="w-5 h-5 animate-spin" />
//                     ) : (
//                       <Camera className="w-5 h-5" />
//                     )}
//                     Capture Frame
//                   </button>
//                 )}
//               </div>
//             </div>
//           )}

//           {/* Hidden canvas used to grab video frames */}
//           <canvas ref={canvasRef} className="hidden" />

//           {errorMessage && (
//             <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
//               {errorMessage}
//             </p>
//           )}
//         </div>

//         {/* Detection results list */}
//         {results.length > 0 && (
//           <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
//             <div className="flex items-center justify-between p-6 border-b border-slate-200">
//               <h2 className="text-xl font-bold text-slate-800">
//                 Detection Results
//               </h2>
//               <button
//                 onClick={() => setResults([])}
//                 className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
//               >
//                 <RotateCcw className="w-4 h-4" />
//                 Clear
//               </button>
//             </div>

//             <div className="divide-y divide-slate-100">
//               {results.map((r, idx) => (
//                 <div
//                   key={`${r.id}-${idx}`}
//                   className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
//                 >
//                   {/* Annotated thumbnail */}
//                   {r.annotated_image ? (
//                     <div
//                       className="relative shrink-0 group cursor-pointer"
//                       onClick={() => setLightboxSrc(r.annotated_image!)}
//                     >
//                       <img
//                         src={r.annotated_image}
//                         alt="Detection"
//                         className="w-24 h-16 object-cover rounded-lg border border-slate-200"
//                       />
//                       <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
//                         <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
//                       </div>
//                     </div>
//                   ) : (
//                     <div className="w-24 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
//                       <Camera className="w-6 h-6 text-slate-400" />
//                     </div>
//                   )}

//                   {/* Info */}
//                   <div className="flex-1 min-w-0">
//                     <p className="font-medium text-slate-800 truncate">
//                       {r.file_name}
//                     </p>
//                     <p className="text-sm text-slate-500 mt-0.5">
//                       {r.persons} person(s) · {r.masked} masked ·{" "}
//                       {(r.without_mask ?? 0) + (r.incorrect ?? 0)} violation(s)
//                     </p>
//                     <p className="text-xs text-slate-400 mt-0.5">
//                       {r.source} · {r.timestamp} · {r.processing_ms}ms
//                     </p>
//                   </div>

//                   {/* Right side */}
//                   <div className="text-right space-y-1 shrink-0">
//                     <StatusBadge status={r.status} />
//                     <p className="text-xs text-slate-400">
//                       {Number(r.confidence).toFixed(1)}% conf
//                     </p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>
//     </>
//   );
// }

// export default MaskImageCapturePage;


import { useEffect, useRef, useState, useCallback } from "react";
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

// ── Lightbox ─────────────────────────────────────────────────────────────────
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
        className="absolute top-4 right-4 text-white hover:text-slate-300 text-2xl font-bold"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={src}
        alt="Annotated detection"
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────────
function MaskImageCapturePage() {
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [streamResult, setStreamResult] = useState<DetectionResult | null>(
    null
  );
  const [frameCounter, setFrameCounter] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const lastProcessTimeRef = useRef(0);
  const PROCESS_INTERVAL_MS = 500;

  // Load previous logs on mount
  useEffect(() => {
    fetchMaskLogs({ page: 1, pageSize: 50 })
      .then((payload) =>
        setResults(
          (payload.logs || []).map((l) => ({
            ...l,
            compliance: l.status === "Compliant",
          }))
        )
      )
      .catch(() => setErrorMessage("Could not load previous logs."));
  }, []);

  // ── Image upload → real detection ──────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    setErrorMessage("");
    setIsProcessing(true);

    try {
      const responses = await Promise.all(
        files.map((file) => detectMaskImage(file, "Upload"))
      );
      const newResults: DetectionResult[] = responses.map((r) => ({
        ...r.data,
        compliance: r.data.compliance,
        annotated_image: r.data.annotated_image,
      }));
      setResults((prev) => [...newResults, ...prev]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  // ── Process a single frame from video ──────────────────────────────────────
  const processFrame = useCallback(async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      isProcessingRef.current ||
      !isStreaming
    ) {
      return;
    }

    const video = videoRef.current;
    
    if (video.readyState !== 4 || video.videoWidth === 0) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameB64 = canvas.toDataURL("image/jpeg", 0.8);

      const res = await detectMaskStream(frameB64, "cam_01", "Live Camera");
      const result: DetectionResult = {
        ...(res.data as MaskLog),
        compliance: res.data.compliance,
        annotated_image: res.data.annotated_image,
      };
      
      setStreamResult(result);
      setFrameCounter(prev => prev + 1);
      
      if (!result.compliance) {
        setResults((prev) => [result, ...prev].slice(0, 100));
      }
    } catch (err) {
      console.debug("Frame processing error:", err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [isStreaming]);

  // ── Continuous frame processing loop ───────────────────────────────────────
  const processFrameLoop = useCallback((timestamp: number) => {
    if (!isStreaming) return;

    const timeSinceLastProcess = timestamp - lastProcessTimeRef.current;
    
    if (timeSinceLastProcess >= PROCESS_INTERVAL_MS) {
      processFrame();
      lastProcessTimeRef.current = timestamp;
    }

    animationFrameRef.current = requestAnimationFrame(processFrameLoop);
  }, [isStreaming, processFrame]);

  // ── Start continuous processing ────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              resolve(true);
            };
          }
        });
      }
      return true;
    } catch (err) {
      setErrorMessage("Could not access camera. Check permissions.");
      console.error("Camera error:", err);
      return false;
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    
    setStreamResult(null);
    setFrameCounter(0);
    lastProcessTimeRef.current = 0;
  };

  const toggleStreaming = async () => {
    if (!isStreaming) {
      const started = await startCamera();
      if (!started) return;
      
      setIsStreaming(true);
      lastProcessTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(processFrameLoop);
    } else {
      setIsStreaming(false);
      stopCamera();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, []);

  const violationCount = (streamResult?.without_mask ?? 0) + (streamResult?.incorrect ?? 0);
  const totalDetections = frameCounter;

  return (
    <>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/mask-detection"
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Back
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Mask Detection Capture
            </h1>
            <p className="text-slate-600">
              Upload images or use live camera for automatic real-time mask detection
            </p>
          </div>
        </div>

        {/* Mode switcher + input */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <div className="flex gap-4 mb-6">
            {(["upload", "camera"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (isStreaming) {
                    stopCamera();
                    setIsStreaming(false);
                  }
                  setCaptureMode(mode);
                }}
                className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all capitalize ${
                  captureMode === mode
                    ? "bg-teal-500 text-white shadow-lg"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {mode === "upload" ? "Upload Images" : "Live Camera (Auto-Detect)"}
              </button>
            ))}
          </div>

          {/* Upload mode */}
          {captureMode === "upload" && (
            <div>
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
                    <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-teal-600 font-medium">
                      Detecting masks…
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium text-slate-700 mb-1">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-slate-500">
                      PNG, JPG, JPEG (max 10 MB each)
                    </p>
                  </>
                )}
              </label>
            </div>
          )}

          {/* Camera mode */}
          {captureMode === "camera" && (
            <div className="space-y-4">
              {/* Video feed with annotated overlay */}
              <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Annotated overlay */}
                {streamResult?.annotated_image && (
                  <img
                    src={streamResult.annotated_image}
                    alt="Detection overlay"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}
                
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                    <div className="text-center">
                      <p className="text-white text-lg font-medium">Camera not active</p>
                      <p className="text-white/60 text-sm mt-1">Click "Start Camera" to begin</p>
                    </div>
                  </div>
                )}

                {/* Live status overlays */}
                {isStreaming && streamResult && (
                  <>
                    <div className="absolute top-3 left-3">
                      <StatusBadge status={streamResult.status} />
                    </div>
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-3 text-xs text-white">
                        <span>Frames: {totalDetections}</span>
                        <span>Persons: {streamResult.persons}</span>
                        <span>Masked: {streamResult.masked}</span>
                        <span>Violations: {violationCount}</span>
                      </div>
                    </div>
                  </>
                )}
                
                {isStreaming && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-xs font-medium">LIVE • AUTO DETECT</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex justify-center">
                <button
                  onClick={toggleStreaming}
                  className={`px-8 py-3 rounded-lg font-medium shadow-lg transition-all ${
                    isStreaming
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-teal-500 hover:bg-teal-600 text-white hover:shadow-xl"
                  }`}
                >
                  {isStreaming ? "Stop Camera & Detection" : "Start Automatic Detection"}
                </button>
              </div>

              {/* Info note */}
              {isStreaming && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  <p className="font-medium">Automatic Detection Active</p>
                  <p className="text-xs mt-1">
                    Processing at 2 FPS. Non-compliant events are automatically logged. 
                    Press "Stop Camera" to end detection.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Hidden canvas used to grab video frames */}
          <canvas ref={canvasRef} className="hidden" />

          {errorMessage && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
              {errorMessage}
            </p>
          )}
        </div>

        {/* Detection results list */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200/50 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Violation History
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {results.length} non-compliant events recorded
                </p>
              </div>
              <button
                onClick={() => setResults([])}
                className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Clear History
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {results.map((r, idx) => (
                <div
                  key={`${r.id}-${idx}`}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Annotated thumbnail */}
                  {r.annotated_image ? (
                    <div
                      className="relative shrink-0 group cursor-pointer"
                      onClick={() => setLightboxSrc(r.annotated_image!)}
                    >
                      <img
                        src={r.annotated_image}
                        alt="Detection"
                        className="w-24 h-16 object-cover rounded-lg border border-slate-200"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                        <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          Zoom
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-slate-400 text-xs">No preview</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {r.file_name || `Violation at ${r.timestamp}`}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Persons: {r.persons} · Masked: {r.masked} · 
                      Violations: {(r.without_mask ?? 0) + (r.incorrect ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.source} · {r.timestamp} · {r.processing_ms}ms
                    </p>
                  </div>

                  {/* Right side */}
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

export default MaskImageCapturePage;