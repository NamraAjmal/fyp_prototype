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

function FaceImageCapturePage() {
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [detectionResults, setDetectionResults] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setUploadedImages([...uploadedImages, ...filesArray]);

      // Simulate detection results
      const mockResults = filesArray.map((file, index) => ({
        id: Date.now() + index,
        fileName: file.name,
        facesDetected: Math.floor(Math.random() * 3) + 1,
        confidence: (Math.random() * 20 + 80).toFixed(1),
        matched: Math.random() > 0.3,
        matchedName: Math.random() > 0.3 ? "John Doe" : "Unknown",
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
    // Simulate capturing a frame and detecting faces
    const mockResult = {
      id: Date.now(),
      fileName: "camera-capture.jpg",
      facesDetected: Math.floor(Math.random() * 3) + 1,
      confidence: (Math.random() * 20 + 80).toFixed(1),
      matched: Math.random() > 0.3,
      matchedName: Math.random() > 0.3 ? "Jane Smith" : "Unknown",
    };
    setDetectionResults([mockResult, ...detectionResults]);
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
            Image & Camera Capture
          </h1>
          <p className="text-slate-600">
            Upload images or use live camera for face detection
          </p>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-slate-200/50">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setCaptureMode("upload")}
            className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
              captureMode === "upload"
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
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
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Camera className="w-5 h-5 inline mr-2" />
            Live Camera
          </button>
        </div>

        {/* Upload Mode */}
        {captureMode === "upload" && (
          <div>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 hover:border-blue-500 transition-colors cursor-pointer">
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

        {/* Camera Mode */}
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
                    : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:shadow-xl text-white"
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

      {/* Detection Results */}
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
                    {result.facesDetected} face(s) detected • Confidence:{" "}
                    {result.confidence}%
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                      result.matched
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {result.matched
                      ? `Matched: ${result.matchedName}`
                      : "No Match"}
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

export default FaceImageCapturePage;
