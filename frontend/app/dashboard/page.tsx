"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) {
      router.replace(`/dashboard/students`);
    } else if (!loading && !profile) {
      router.replace("/");
    }
  }, [profile, loading, router]);

  return null;
}
