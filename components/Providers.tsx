"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/lib/client/theme";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <MotionConfig reducedMotion="user" nonce={nonce}>
      <ThemeProvider>{children}</ThemeProvider>
    </MotionConfig>
  );
}
