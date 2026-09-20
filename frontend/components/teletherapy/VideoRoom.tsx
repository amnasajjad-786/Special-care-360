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
 * TWO MODES
 * ---------
 * JaaS (8x8), when the backend has credentials. It asks GET
 * /api/teletherapy/token for a signed JWT naming this user as moderator or
 * participant, and joins `8x8.vc/<tenant>/<room>?jwt=...`. This is the mode to
 * use for real sessions: the therapist is the moderator, so the call starts.
 *
 * Plain meet.jit.si otherwise. The public instance will NOT start a conference
 * until a moderator joins, and becoming one requires a Jitsi account, so both
 * participants can load the room and still never be connected -- they sit on
 * "The conference has not yet started because no moderators have yet arrived".
 * Workable for a click-through demo if the therapist presses Log-in inside the
 * frame once per room; not workable for anything real.
 *
 * The fallback is deliberate: an unconfigured deployment degrades to a room
 * that loads rather than to an error.
 */

const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JaasGrant {
  token: string;
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
  roomName, displayName, sessionId, getIdToken, onLeave,
}: Props) {
  const [joined, setJoined] = useState(false);
  const [grant, setGrant] = useState<JaasGrant | null>(null);
  const [checking, setChecking] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Leaving the page should not leave a live camera behind.
  useEffect(() => {
    return () => setJoined(false);
  }, []);

  // Ask the backend for a JaaS grant. A 503 simply means JaaS is not set up,
  // which is not an error worth showing anyone.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authToken = await getIdToken();
        if (!authToken) return;
        const res = await fetch(
          `${API_BASE}/api/teletherapy/token?sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) {
          if (res.status !== 503) {
            console.warn("[teletherapy] video token unavailable:", res.status);
          }
          return;
        }
        const data = (await res.json()) as JaasGrant;
        if (!cancelled) setGrant(data);
      } catch (err) {
        console.warn("[teletherapy] could not reach the token endpoint:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, getIdToken]);

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
  if (!grant) {
    hashParams.unshift(`userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`);
  }

  const roomUrl = grant
    ? `https://${grant.domain}/${grant.room}?jwt=${encodeURIComponent(grant.token)}#${hashParams.join("&")}`
    : `https://${JITSI_DOMAIN}/${encodeURIComponent(roomName)}#${hashParams.join("&")}`;

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
          <h3 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700 }}>Ready to join</h3>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "0.86rem", lineHeight: 1.5, maxWidth: "420px" }}>
            Your camera and microphone stay off until you join. The room is private
            to this session.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setJoined(true)}
          disabled={checking}
          style={{ padding: "12px 28px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <Video size={16} /> {checking ? "Preparing room…" : "Join session"}
        </button>
        {!checking && !grant && (
          <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-secondary)", maxWidth: "420px", lineHeight: 1.5 }}>
            Running on the public Jitsi server. The therapist may need to sign in
            inside the call before it will start.
          </p>
        )}
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
