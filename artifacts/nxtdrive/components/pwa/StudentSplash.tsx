"use client";

import { motion } from "framer-motion";

export function StudentSplash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8 text-foreground">
      <span className="sr-only">Leerlingapp laden</span>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-brand-muted">
        <motion.div
          className="h-full w-1/2 rounded-full bg-brand-primary"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
