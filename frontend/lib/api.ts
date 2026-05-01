import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  try {
    // Dynamically import to avoid SSR issues
    const { auth } = await import("./firebase");
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Demo mode — send placeholder token
      config.headers.Authorization = "Bearer demo-token";
    }
  } catch {
    config.headers.Authorization = "Bearer demo-token";
  }
  return config;
});

// ─── Type-safe API helpers ─────────────────────────────────────────────────

export const studentsApi = {
  list: (centerId = "demo-center-001") => api.get(`/api/students?centerId=${centerId}`),
  get: (id: string) => api.get(`/api/students/${id}`),
  create: (data: Record<string, unknown>) => api.post("/api/students", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/api/students/${id}`, data),
  getMedical: (id: string) => api.get(`/api/students/${id}/medical`),
  updateMedical: (id: string, data: Record<string, unknown>) => api.put(`/api/students/${id}/medical`, data),
  getCarePlan: (id: string) => api.get(`/api/students/${id}/careplan`),
  updateCarePlan: (id: string, data: Record<string, unknown>) => api.put(`/api/students/${id}/careplan`, data),
};

export const dailyCareApi = {
  submit: (data: Record<string, unknown>) => api.post("/api/daily-care", data),
  get: (studentId: string, date: string) => api.get(`/api/daily-care/${studentId}/${date}`),
  history: (studentId: string) => api.get(`/api/daily-care/${studentId}/history`),
};

export const abcApi = {
  logIncident: (data: Record<string, unknown>) => api.post("/api/abc/incidents", data),
  listIncidents: (studentId: string) => api.get(`/api/abc/incidents/${studentId}`),
  getPatterns: (studentId: string) => api.get(`/api/abc/patterns/${studentId}`),
  getHeatmap: (studentId: string) => api.get(`/api/abc/heatmap/${studentId}`),
};

export const panicApi = {
  sendAlert: (data: Record<string, unknown>) => api.post("/api/panic/alert", data),
  listAlerts: (centerId = "demo-center-001", status = "all") =>
    api.get(`/api/panic/alerts?centerId=${centerId}&status=${status}`),
  resolveAlert: (id: string, resolvedBy: string) =>
    api.put(`/api/panic/alerts/${id}/resolve`, { resolvedBy }),
};

export const authApi = {
  register: (data: Record<string, unknown>) => api.post("/api/auth/register", data),
  createProfile: (data: Record<string, unknown>) => api.post("/api/auth/profile", data),
  getMe: () => api.get("/api/auth/me"),
};
