"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CalendarRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/therapy-timeline");
  }, [router]);

  return (
    <div style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
      Redirecting to Dynamic Therapy Timeline...
    </div>
  );
}
