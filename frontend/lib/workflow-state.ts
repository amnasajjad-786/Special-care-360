/** State restored after navigation/reload; a draft never masquerades as active. */
export function restoreIep(care: Record<string, unknown>, editable: boolean) {
  const draft = editable && care.draftIep && typeof care.draftIep === "object"
    ? care.draftIep as Record<string, unknown> : null;
  return {
    goals: Array.isArray(draft?.goals) ? draft.goals : Array.isArray(care.goals) ? care.goals : [],
    summary: String(draft?.summary ?? care.iepSummary ?? ""),
    id: String(draft?.id ?? care.activeIepId ?? ""),
    draft: !!draft,
  };
}

export function localDateTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A queued offline write is not confirmation that the server recorded it. */
export function confirmWithin(write: Promise<void>, milliseconds = 5000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    write.then(() => { clearTimeout(timer); resolve(true); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** CSV cells are quoted and formula-looking values are rendered as plain text. */
export function csvText(rows: unknown[][]): string {
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
