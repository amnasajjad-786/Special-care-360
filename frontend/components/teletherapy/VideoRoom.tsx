"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff, ExternalLink } from "lucide-react";

/**
 * Embedded Jitsi Meet room.
 *
 * Rendered as a plain iframe rather than via external_api.js: the script tag
 * approach needs a third-party script on every page load and gives us nothing
 * we use here. The room name comes from the session id, so it is unguessable.
 *
 * JaaS (8x8) asks GET
 * /api/teletherapy/token for a signed JWT naming this user as moderator or
 * participant, and joins `8x8.vc/<tenant>/<room>?jwt=...`. This is the mode to
 * use for real sessions: the therapist is the moderator, so the call starts.
 *
 * Public Jitsi is available only when explicitly selected in the backend.
 * Authorization failures never fall back to a public room.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JaasGrant {
  provider?: "jaas" | "jitsi";
  token: string | null;
  room: string;
  domain: string;
  moderator: boolean;
}

interface Props {
  roomName: string;
  displayName: string;
  /** teletherapySessions document id, used to scope the JaaS token. */
  sessionId: string;
  getIdToken: () => Promise<string | null>;
  onLeave: () => void;
}

export default function VideoRoom({
  displayName, sessionId, getIdToken, onLeave,
}: Props) {
  const [joined, setJoined] = useState(false);
  const [grant, setGrant] = useState<JaasGrant | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Leaving the page should not leave a live camera behind.
  useEffect(() => {
    return () => setJoined(false);
  }, []);

  // Require backend authorization before rendering a room or join link.
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setConnectionError("");
    setGrant(null);
    setJoined(false);
    (async () => {
      try {
        const authToken = await getIdToken();
        if (cancelled) return;
        if (!authToken) { setConnectionError("Sign in again to join this session."); return; }
        const res = await fetch(
          `${API_BASE}/api/teletherapy/token?sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (cancelled) return;
        if (!res.ok) {
          const error = await res.json().catch(() => null);
          if (cancelled) return;
          setConnectionError(
            res.status === 401 ? "Your sign-in has expired. Sign in again to join this session."
              : res.status === 403 ? "You are not authorized to join this session."
              : res.status === 404 ? "This session no longer exists. Return to sessions and select another session."
              : res.status === 503 && error?.detail === "Secure video service is not configured"
                ? "Video calls have not been set up for this centre yet. Please contact your centre administrator."
                : "The video service is temporarily unavailable. Please retry."
          );
          if (res.status !== 503) {
            console.warn("[teletherapy] video token unavailable:", res.status);
          }
          return;
        }
        const data = (await res.json()) as JaasGrant;
        if (!cancelled) setGrant(data);
      } catch (err) {
        if (cancelled) return;
        setConnectionError("Secure video is unavailable. Check your connection and retry.");
        console.warn("[teletherapy] could not reach the token endpoint:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, getIdToken, retryCount]);

  if (connectionError) return <div role="alert" className="glass-card" style={{ padding: 24 }}><p>{connectionError}</p><div style={{ display: "flex", gap: 12, marginTop: 16 }}><button className="btn-primary" onClick={() => setRetryCount(count => count + 1)}>Retry connection</button><button className="btn-ghost" onClick={onLeave}>Return to sessions</button></div></div>;
  if (checking || !grant) return <div className="glass-card" style={{ padding: 24 }}>Preparing video…</div>;

  // Jitsi parses each hash parameter as JSON, so a string value has to arrive
  // quoted -- `userInfo.displayName=Amna` is invalid JSON and is dropped, which
  // is why the name never reached the room. Booleans are passed bare.
  //
  // URLSearchParams is not usable here: it percent-encodes the dots in the
  // config keys, and Jitsi then fails to match them.
  const hashParams = [
    "config.prejoinConfig.enabled=false",
    // Renamed upstream. The old key is kept so the setting still applies to
    // self-hosted instances pinned to an older Jitsi.
    "config.prejoinPageEnabled=false",
    "config.disableDeepLinking=true",
  ];
  // With JaaS the display name comes from the signed token, so sending it in
  // the hash as well would let a participant rename themselves.
  const publicJitsi = grant.provider === "jitsi";
  if (publicJitsi) {
    hashParams.push(`userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`);
  }
  const tokenQuery = grant.token ? `?jwt=${encodeURIComponent(grant.token)}` : "";
  const roomUrl = `https://${grant.domain}/${grant.room}${tokenQuery}#${hashParams.join("&")}`;

  if (!joined) {
    return (
      <div
        className="glass-card"
        style={{ padding: "32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}
      >
        <div style={{ color: "var(--accent-teal)" }}>
          <Video size={44} />
        </div>
        <div>
          <h3 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700 }}>Ready to join as {displayName}</h3>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "0.86rem", lineHeight: 1.5, maxWidth: "420px" }}>
            {publicJitsi
              ? "Jitsi demo room: anyone with the meeting link can join. The therapist must sign in to Jitsi to start the call; parents wait until the host arrives."
              : "Your camera and microphone stay off until you join. The room is private to this session."}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (publicJitsi && grant.moderator) {
              window.open(roomUrl, "_blank", "noopener,noreferrer");
            } else {
              setJoined(true);
            }
          }}
          disabled={checking}
          style={{ padding: "12px 28px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <Video size={16} /> {publicJitsi && grant.moderator ? "Start session in Jitsi" : "Join session"}
        </button>
        <a
          href={roomUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <ExternalLink size={13} /> Open in a new tab instead
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="glass-card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <iframe
        title="Teletherapy session"
        src={roomUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{
          width: "100%",
          height: "min(70vh, 560px)",
          border: "none",
          borderRadius: "12px",
          background: "#0b0b0f",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn-danger"
          onClick={() => { setJoined(false); onLeave(); }}
          style={{ padding: "9px 20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <VideoOff size={15} /> Leave session
        </button>
      </div>
    </div>
  );
}
