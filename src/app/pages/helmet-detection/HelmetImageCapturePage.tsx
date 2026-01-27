import { useState, useRef } from "react";
import {
  ArrowLeft,
  Camera,
  Upload,
  Play,
  Square,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router";

function HelmetImageCapturePage() {
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [detectionResults, setDetectionResults] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setUploadedImages([...uploadedImages, ...filesArray]);

      const mockResults = filesArray.map((file, index) => ({
        id: Date.now() + index,
        fileName: file.name,
        personsDetected: Math.floor(Math.random() * 5) + 1,
        helmetsDetected: Math.floor(Math.random() * 4),
        compliance: Math.random() > 0.2,
        confidence: (Math.random() * 20 + 80).toFixed(1),
      }));

      setDetectionResults([...detectionResults, ...mockResults]);
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

  const captureFrame = () => {
    const mockResult = {
      id: Date.now(),
      fileName: "camera-capture.jpg",
      personsDetected: Math.floor(Math.random() * 5) + 1,
      helmetsDetected: Math.floor(Math.random() * 4),
      compliance: Math.random() > 0.2,
      confidence: (Math.random() * 20 + 80).toFixed(1),
    };
    setDetectionResults([mockResult, ...detectionResults]);
  };

  return (
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
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg"
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
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg"
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
                <div className="grid grid-cols-4 gap-4">
                  {uploadedImages.map((file, index) => (
                    <div key={index} className="relative group">
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
                    : "bg-gradient-to-r from-orange-500 to-red-500 hover:shadow-xl text-white"
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
                  className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium shadow-lg transition-all"
                >
                  <Camera className="w-5 h-5" />
                  Capture Frame
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {detectionResults.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              Detection Results
            </h2>
            <button
              onClick={() => setDetectionResults([])}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Clear Results
            </button>
          </div>

          <div className="space-y-3">
            {detectionResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800">
                    {result.fileName}
                  </p>
                  <p className="text-sm text-slate-600">
                    {result.personsDetected} person(s) •{" "}
                    {result.helmetsDetected} helmet(s) • Confidence:{" "}
                    {result.confidence}%
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
                    {result.compliance ? "Compliant" : "Violation"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default HelmetImageCapturePage;
