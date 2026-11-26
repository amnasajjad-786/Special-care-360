import type { MetadataRoute } from "next";

// Makes the web app installable on phones and tablets (Add to Home Screen),
// so it opens full-screen like a native app. This is the mobile client: the
// same code base and the same Firestore rules, no second app to keep in sync.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Special Care 360",
    short_name: "Care 360",
    description: "Care coordination for special education centres, therapists and families.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#3d4f6b",
    categories: ["education", "health", "medical"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press shortcuts on the home-screen icon. Each route is still gated
    // by ROLE_PATHS, so a shortcut a role may not use simply redirects.
    shortcuts: [
      { name: "Students", url: "/dashboard/students", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Daily Care", url: "/dashboard/daily-care", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", url: "/dashboard/messages", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Documents", url: "/dashboard/documents", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
