import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Special Care 360 — HIPAA-Compliant Special Education Platform",
  description:
    "A comprehensive platform for special education centers — student profiles, daily care journaling, behavioral tracking, and crisis management.",
  keywords: "special education, HIPAA, IEP, behavioral tracking, daily care",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "rgba(255, 255, 255, 0.92)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.6)",
                borderRadius: "12px",
                boxShadow: "0 8px 32px rgba(31, 38, 135, 0.15)",
                color: "#2d3748",
                fontSize: "0.9rem",
                fontWeight: "500",
              },
              success: {
                iconTheme: { primary: "#38a169", secondary: "white" },
              },
              error: {
                iconTheme: { primary: "#e53e3e", secondary: "white" },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
