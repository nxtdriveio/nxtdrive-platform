"use client";

import { motion } from "framer-motion";
import { BrandLogo } from "@/components/pwa/BrandLogo";

/**
 * Premium launch splash for the Instructeur PWA. Light shell with the same
 * NXTDRIVE gradient accent used by the cockpit loading state.
 */
export function InstructorSplash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-background px-6 text-foreground">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-brand-border bg-white/92 px-8 py-7 text-center shadow-brand-floating"
      >
        <BrandLogo className="h-16 w-16" accent />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            NXTDRIVE Instructeur
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vandaag slim en overzichtelijk lesgeven
          </p>
        </div>
        <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-brand-muted">
          <motion.div
            className="h-full w-1/2 rounded-full bg-brand-primary"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </div>
  );
}
