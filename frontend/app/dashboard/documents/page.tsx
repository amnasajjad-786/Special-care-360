"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileText, FileUp, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { scopeOf, studentsDb, type StudentDoc } from "@/lib/firestore-api";
import {
  ACCEPTED_DOCUMENTS, DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, documentsDb, type StudentDocument,
} from "@/lib/documents-api";
import ProgressReport from "@/components/documents/ProgressReport";

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const CATEGORY_LABEL = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.id, c.label]));

export default function DocumentsPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<StudentDoc[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [documents, setDocuments] = useState<StudentDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("assessment");
  const [busy, setBusy] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    studentsDb.list(scopeOf(profile))
      .then((rows) => { setStudents(rows); setSelectedId((c) => c || rows[0]?.id || ""); })
      .catch((err) => { console.error("[documents] students failed:", err); setLoadError("Your students could not be loaded."); });
  }, [profile]);

  const refresh = useCallback(async () => {
    if (!selectedId || !profile) return;
    try {
      setDocuments(await documentsDb.list(selectedId, profile));
      setLoadError(null);
    } catch (err) {
      console.error("[documents] list failed:", err);
      setLoadError("Documents could not be loaded. Check your connection and that the latest Firestore rules are deployed.");
    }
  }, [selectedId, profile]);

  useEffect(() => {
    // Show a loading state for the newly selected child, then fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocuments(null);
    void refresh();
  }, [refresh]);

  const selected = students?.find((s) => s.id === selectedId) ?? null;

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedId) return;
    if (file.size > MAX_DOCUMENT_BYTES) { toast.error("Documents are limited to 10 MB."); return; }
    setBusy("upload");
    try {
      await documentsDb.upload(selectedId, file, title, category);
      toast.success("Document shared with the care team.");
      setFile(null);
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const download = async (doc: StudentDocument) => {
    setBusy(doc.id);
    try { await documentsDb.download(doc); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Download failed."); }
    finally { setBusy(null); }
  };

  const remove = async (doc: StudentDocument) => {
    if (!window.confirm(`Delete "${doc.title}" for everyone on the care team? This cannot be undone.`)) return;
    setBusy(doc.id);
    try {
      await documentsDb.remove(doc);
      toast.success("Document deleted.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  };

  if (students === null && !loadError) return <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />;
  if (students && students.length === 0) {
    return <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>You are not linked to any student yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="glass-card" style={{ padding: "16px 22px", display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
          Student
          <select className="glass-input" style={{ minWidth: 200 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" disabled={!selected} onClick={() => setShowReport(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Printer size={15} /> Generate progress report
        </button>
      </div>

      <form onSubmit={upload} className="glass-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: 8 }}>
          <FileUp size={18} /> Share a document
        </h3>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          PDF, PNG, JPEG or Word (.docx), up to 10 MB. Files are stored privately and visible only to {selected?.name ?? "this child"}&apos;s guardian, assigned staff and centre admins.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input ref={fileInput} type="file" accept={ACCEPTED_DOCUMENTS} onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Document file" />
          <input className="glass-input" style={{ flex: "1 1 200px" }} placeholder="Title (e.g. Speech assessment, March)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <select className="glass-input" style={{ maxWidth: 220 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button type="submit" className="btn-primary" disabled={!file || busy === "upload"}>{busy === "upload" ? "Uploading..." : "Upload"}</button>
        </div>
      </form>

      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={18} /> Shared documents
        </h3>
        {loadError ? (
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{loadError}</p>
        ) : documents === null ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
        ) : documents.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>No documents have been shared for {selected?.name ?? "this child"} yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Title</th><th>Category</th><th>Shared by</th><th>Date</th><th>Size</th><th /></tr></thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.title}<div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}>{d.fileName}</div></td>
                    <td><span className="chip chip-info" style={{ fontSize: "0.72rem" }}>{CATEGORY_LABEL[d.category] ?? d.category}</span></td>
                    <td style={{ fontSize: "0.82rem" }}>{d.uploadedByName || "Care team"}<div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{d.uploadedByRole}</div></td>
                    <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td style={{ fontSize: "0.82rem" }}>{size(d.size)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn-ghost" disabled={busy === d.id} onClick={() => download(d)} style={{ padding: "6px 10px", marginRight: 6 }} aria-label={`Download ${d.title}`}>
                        <Download size={14} />
                      </button>
                      {(d.uploadedBy === profile?.uid || profile?.role === "admin") && (
                        <button className="btn-ghost" disabled={busy === d.id} onClick={() => remove(d)} style={{ padding: "6px 10px", color: "var(--danger)" }} aria-label={`Delete ${d.title}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showReport && selected && <ProgressReport student={selected} profile={profile} onClose={() => setShowReport(false)} />}
    </div>
  );
}
