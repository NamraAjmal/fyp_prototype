// services/maskApi.ts - add these new functions

const API_BASE = "http://localhost:5000";

export type MaskLog = {
  id: number;
  timestamp: string;
  persons: number;
  masked: number;
  without_mask: number;
  incorrect: number;
  status: "Compliant" | "Non-Compliant" | "No Persons Detected";
  confidence: number;
  file_name: string;
  source: string;
  camera_id: string;
  processing_ms: number;
  annotated_image?: string; // base64 for display
};

export type MaskDetectionResponse = {
  status: string;
  message: string;
  data: MaskLog & {
    compliance: boolean;
    detections: Array<{
      label: string;
      confidence: number;
      type: string;
      bbox?: number[];
    }>;
    annotated_image?: string;
  };
};

export type MaskSummary = {
  total_detections: number;
  compliant: number;
  non_compliant: number;
  no_person_detections: number;
  avg_confidence: number;
  compliance_rate: number;
};

type MaskStatsResponse = {
  status: string;
  data: {
    total_detections: number;
    compliance_rate: number;
    violations_today: number;
    compliant: number;
    non_compliant: number;
    no_person: number;
    avg_confidence: number;
  };
};

export type MaskLogsResponse = {
  logs: MaskLog[];
  summary: MaskSummary;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

// Real detection — sends image to backend, gets annotated frame back
export async function detectMaskImage(
  file: File,
  location = "Unknown Site"
): Promise<MaskDetectionResponse> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("location", location);
  formData.append("source", "image");

  const res = await fetch(`${API_BASE}/mask-detect`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Detection failed: ${res.statusText}`);
  return res.json();
}

// Stream frame detection — sends base64 frame, gets result back
export async function detectMaskStream(
  frameBase64: string,
  cameraId = "cam_01",
  location = "Unknown Site"
): Promise<{
  status: string;
  data: MaskLog & { compliance: boolean; annotated_image?: string };
}> {
  const res = await fetch(`${API_BASE}/mask-detect-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame: frameBase64, camera_id: cameraId, location }),
  });
  if (!res.ok) throw new Error(`Stream detection failed: ${res.statusText}`);
  return res.json();
}

export async function fetchMaskLogs(
  params: {
    page?: number;
    pageSize?: number;
    status?: string;
    startTime?: string;
    endTime?: string;
  } = {}
): Promise<MaskLogsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("page_size", String(params.pageSize));
  if (params.status && params.status !== "all")
    query.set("status", params.status);
  if (params.startTime) query.set("start_time", params.startTime);
  if (params.endTime) query.set("end_time", params.endTime);

  const res = await fetch(`${API_BASE}/mask-logs?${query}`);
  if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
  return res.json();
}

export async function fetchMaskSummary(): Promise<MaskSummary> {
  const res = await fetch(`${API_BASE}/mask-stats`);
  if (!res.ok) throw new Error(`Failed to fetch summary: ${res.statusText}`);

  const payload: MaskStatsResponse = await res.json();
  return {
    total_detections: payload.data.total_detections ?? 0,
    compliant: payload.data.compliant ?? 0,
    non_compliant: payload.data.non_compliant ?? 0,
    no_person_detections: payload.data.no_person ?? 0,
    avg_confidence: payload.data.avg_confidence ?? 0,
    compliance_rate: payload.data.compliance_rate ?? 0,
  };
}

export async function createMaskLog(params: {
  persons: number;
  masked: number;
  without_mask: number;
  status: string;
  confidence: number;
  fileName: string;
  source: string;
  camera_id?: string;
  processing_ms?: number;
}) {
  const res = await fetch(`${API_BASE}/mask-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      persons: params.persons,
      masked: params.masked,
      without_mask: params.without_mask,
      status: params.status,
      confidence: params.confidence,
      file_name: params.fileName,
      source: params.source,
      camera_id: params.camera_id ?? "",
      processing_ms: params.processing_ms ?? 0,
    }),
  });
  if (!res.ok) throw new Error(`Failed to save log: ${res.statusText}`);
  return res.json();
}
