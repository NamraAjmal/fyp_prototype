import { buildAuthHeaders } from "./authSession";

const API_BASE = "http://127.0.0.1:5000";

export interface DashboardActivity {
  type: string;
  message: string;
  time: string;
}

export interface DashboardOverview {
  residentsTotal: number;
  activeResidents: number;
  totalImages: number;
  totalFacesDetected: number;
  enrollmentsToday: number;
  helmetDetectionsTotal: number;
  helmetDetectionsToday: number;
  maskDetectionsTotal: number;
  maskDetectionsToday: number;
  safetyDetectionsTotal: number;
  safetyDetectionsToday: number;
  recentActivity: DashboardActivity[];
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const res = await fetch(`${API_BASE}/dashboard-overview`, {
    headers: buildAuthHeaders(),
  });
  const result = await res.json();

  if (result.status !== "success") {
    throw new Error(result.message || "Failed to fetch dashboard overview");
  }

  const d = result.data;
  return {
    residentsTotal: d.residentsTotal ?? 0,
    activeResidents: d.activeResidents ?? 0,
    totalImages: d.totalImages ?? 0,
    totalFacesDetected: d.totalFacesDetected ?? 0,
    enrollmentsToday: d.enrollmentsToday ?? 0,
    helmetDetectionsTotal: d.helmetDetectionsTotal ?? 0,
    helmetDetectionsToday: d.helmetDetectionsToday ?? 0,
    maskDetectionsTotal: d.maskDetectionsTotal ?? 0,
    maskDetectionsToday: d.maskDetectionsToday ?? 0,
    safetyDetectionsTotal: d.safetyDetectionsTotal ?? 0,
    safetyDetectionsToday: d.safetyDetectionsToday ?? 0,
    recentActivity: d.recentActivity ?? [],
  };
}
