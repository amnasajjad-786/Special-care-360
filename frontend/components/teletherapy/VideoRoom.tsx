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
 * The domain is configurable because the public meet.jit.si instance may ask
 * the first participant to sign in before it will create a room. Point
 * NEXT_PUBLIC_JITSI_DOMAIN at a self-hosted or 8x8 instance to avoid that.
 */

const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";

interface Props {
  roomName: string;
  displayName: string;
  onLeave: () => void;
}

export default function VideoRoom({ roomName, displayName, onLeave }: Props) {
  const [joined, setJoined] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Leaving the page should not leave a live camera behind.
  useEffect(() => {
    return () => setJoined(false);
  }, []);

  const params = new URLSearchParams({
    "userInfo.displayName": displayName,
    "config.prejoinPageEnabled": "false",
    "config.disableDeepLinking": "true",
  });
  const roomUrl = `https://${JITSI_DOMAIN}/${encodeURIComponent(roomName)}#${params.toString()}`;

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
        <button className="btn-primary" onClick={() => setJoined(true)} style={{ padding: "12px 28px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <Video size={16} /> Join session
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
