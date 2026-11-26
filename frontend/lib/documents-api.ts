/**
 * documents-api.ts — student documents and reports (Charter scope).
 *
 * Listing reads Firestore `studentDocuments` directly under the rules, scoped
 * like every other child record. Upload, download and delete go through the
 * FastAPI backend, which owns the private storage bucket and re-checks access
 * on every call. The browser never holds a storage credential.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { scopeOf } from "./firestore-api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DOCUMENTS = ".pdf,.png,.jpg,.jpeg,.docx";

export const DOCUMENT_CATEGORIES: { id: string; label: string }[] = [
  { id: "assessment", label: "Assessment" },
  { id: "progress_report", label: "Progress report" },
  { id: "iep", label: "IEP document" },
  { id: "medical", label: "Medical letter / record" },
  { id: "consent", label: "Consent form" },
  { id: "other", label: "Other" },
];

export interface StudentDocument {
  id: string;
  studentId: string;
  centerId: string;
  parentId: string | null;
  title: string;
  category: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByRole: string;
  createdAt: string;
}

type Profile = { uid?: string; role?: string; centerId?: string; name?: string } | null | undefined;

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to continue.");
  return user.getIdToken();
}

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  if (response.status === 503) return new Error(body.detail || "Document storage is not configured on the server yet.");
  return new Error(body.detail || fallback);
}

export const documentsDb = {
  async list(studentId: string, profile: Profile): Promise<StudentDocument[]> {
    const scope = scopeOf(profile);
    const scoped = scope.role === "parent" ? where("parentId", "==", scope.uid) : where("centerId", "==", scope.centerId);
    const snap = await getDocs(query(collection(db, "studentDocuments"), where("studentId", "==", studentId), scoped));
    return snap.docs
      .map((d) => ({ ...(d.data() as StudentDocument), id: d.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async upload(studentId: string, file: File, title: string, category: string): Promise<StudentDocument> {
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Documents are limited to 10 MB.");
    const params = new URLSearchParams({ title: title.trim() || file.name, category, filename: file.name });
    const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(studentId)}?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) throw await failure(response, "Upload failed.");
    return response.json();
  },

  async download(document: StudentDocument): Promise<void> {
    const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(document.studentId)}/${document.id}/download`, {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!response.ok) throw await failure(response, "Could not open the document.");
    const { url } = await response.json();
    // A five-minute signed link served as an attachment, so following it
    // downloads the file without leaving the page. (A new window opened
    // after an await would be caught by popup blockers.)
    window.location.assign(url);
  },

  async remove(document: StudentDocument): Promise<void> {
    const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(document.studentId)}/${document.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!response.ok) throw await failure(response, "Could not delete the document.");
  },
};
