import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Enter — ORV Reader",
  description: "Speak your reader name to enter the shell.",
};

export const dynamic = "force-dynamic";

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthGate />
    </Suspense>
  );
}
