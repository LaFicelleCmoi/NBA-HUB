"use client";

import { MotionConfig } from "framer-motion";
import { FavoriteProvider } from "@/lib/client/favorite";
import { ThemeProvider } from "@/lib/client/theme";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <MotionConfig reducedMotion="user" nonce={nonce}>
      <ThemeProvider>
        <FavoriteProvider>{children}</FavoriteProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
