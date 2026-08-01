"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function ThemedToaster() {
  const { isDark } = useTheme();

  return (
    <Toaster
      position="top-right"
      theme={isDark ? "dark" : "light"}
      toastOptions={{
        style: isDark
          ? {
              background: "#18181B",
              border: "1px solid #27272A",
              color: "#FAFAFA",
            }
          : {
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              color: "#18181B",
            },
      }}
    />
  );
}