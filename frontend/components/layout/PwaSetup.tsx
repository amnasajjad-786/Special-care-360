"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { Download, Share, X } from "lucide-react";

/**
 * Registers the service worker (production builds only), offers an update when
 * a new version is deployed, and shows an install prompt: the browser's own
 * install dialog where supported, or Add to Home Screen steps on iPhone/iPad.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "care360-install-dismissed";
const noop = () => () => {};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad Safari in a tab: no install event exists, so explain the steps. */
function needsIosHint() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && !isStandalone() && localStorage.getItem(DISMISSED_KEY) !== "1";
}

function offerUpdate(worker: ServiceWorker) {
  toast(
    (t) => (
      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        A new version is available.
        <button
          className="btn-primary"
          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
          onClick={() => {
            toast.dismiss(t.id);
            worker.postMessage("SKIP_WAITING");
          }}
        >
          Update
        </button>
      </span>
    ),
    { duration: Infinity, id: "sw-update" },
  );
}

export default function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const iosHint = useSyncExternalStore(noop, needsIosHint, () => false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker left over from a production run would serve stale dev assets.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          incoming?.addEventListener("statechange", () => {
            // Only an update, not the very first install, needs a prompt.
            if (incoming.state === "installed" && navigator.serviceWorker.controller) offerUpdate(incoming);
          });
        });
      })
      .catch((err) => console.error("Service worker registration failed", err));

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (localStorage.getItem(DISMISSED_KEY) !== "1") setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setInstallEvent(null);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === "dismissed") dismiss();
  };

  if (dismissed || (!installEvent && !iosHint)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Special Care 360"
      className="glass-card"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "16px",
        transform: "translateX(-50%)",
        width: "min(420px, calc(100vw - 32px))",
        padding: "14px 16px",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "rgba(255,255,255,0.96)",
      }}
    >
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: "10px", flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
        <strong style={{ color: "var(--primary-dark)", display: "block" }}>Install Care 360</strong>
        {installEvent ? (
          "Open it from your home screen like any other app."
        ) : (
          <>
            Tap <Share size={14} style={{ verticalAlign: "-2px" }} aria-label="Share" /> then
            &ldquo;Add to Home Screen&rdquo;.
          </>
        )}
      </div>
      {installEvent && (
        <button className="btn-primary" style={{ padding: "8px 14px", fontSize: "0.85rem" }} onClick={install}>
          <Download size={15} /> Install
        </button>
      )}
      <button className="btn-ghost" aria-label="Dismiss" style={{ padding: "6px" }} onClick={dismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
