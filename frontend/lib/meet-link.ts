/** Accept only standard Google Meet meeting links, never arbitrary redirects. */
export function googleMeetLink(value?: string): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "meet.google.com" ||
        url.port || url.username || url.password ||
        !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) return "";
    return `https://meet.google.com${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}
