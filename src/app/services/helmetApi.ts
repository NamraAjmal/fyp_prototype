import { buildAuthHeaders } from "./authSession";

export type HelmetLog = {
  id: number;
  timestamp: string;
  persons: number;
  helmets: number;
  no_helmet: number;
  status: "Compliant" | "Violation" | "No Persons Detected";
  confidence: number;
  file_name: string;
  annotated_image?: string;
  source?: string;
  camera_id?: string;
  model_name?: string;
  processing_ms?: number;
};

export type HelmetSummary = {
  total_detections: number;
  compliant: number;
  violations: number;
  no_person_detections?: number;
  avg_confidence: number;
  compliance_rate: number;
};

type HelmetLogsResponse = {
  status: string;
  logs: HelmetLog[];
  summary: HelmetSummary;
  message?: string;
};

type DetectHelmetResponse = {
  status: string;
  message?: string;
  data: {
    id: number;
    timestamp: string;
    persons: number;
    helmets: number;
    no_helmet: number;
    status: string;
    confidence: number;
    file_name: string;
    annotated_image?: string;
    source?: string;
    camera_id?: string;
    processing_ms?: number;
    compliance: boolean;
    detections: Array<{
      label: string;
      confidence: number;
      type?: string;
      bbox?: number[];
    }>;
  };
};

const API_BASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ||
  "http://127.0.0.1:5000";

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>
) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

async function parseApiResponse<T extends { status: string; message?: string }>(
  response: Response
): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok || payload.status !== "success") {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
}

export async function detectHelmet(params: {
  file: File;
  source: "image" | "camera" | "stream";
  cameraId?: string;
}) {
  const formData = new FormData();
  formData.append("image", params.file);
  formData.append("source", params.source);
  if (params.cameraId) {
    formData.append("camera_id", params.cameraId);
  }

  const response = await fetch(buildUrl("/helmet-detect"), {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  return parseApiResponse<DetectHelmetResponse>(response);
}

export async function fetchHelmetLogs(params?: {
  page?: number;
  pageSize?: number;
  limit?: number;
  status?: string;
  source?: string;
  minConfidence?: number;
  startTime?: string;
  endTime?: string;
}) {
  const response = await fetch(
    buildUrl("/helmet-logs", {
      page: params?.page,
      page_size: params?.pageSize,
      limit: params?.limit,
      status: params?.status,
      source: params?.source,
      min_confidence: params?.minConfidence,
      start_time: params?.startTime,
      end_time: params?.endTime,
    }),
    {
      headers: buildAuthHeaders(),
    }
  );

  return parseApiResponse<HelmetLogsResponse>(response);
}

export async function fetchHelmetSummary() {
  const payload = await fetchHelmetLogs({ page: 1, pageSize: 1 });
  return payload.summary;
}
