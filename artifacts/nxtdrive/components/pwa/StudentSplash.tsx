"use client";

import { motion } from "framer-motion";
import { BrandLogo } from "@/components/pwa/BrandLogo";

/**
 * Premium launch splash for the Leerling PWA (Task #177). Shown as the Suspense
 * fallback while the first data load resolves. Navy gradient, logo, app name,
 * tagline, subtle fade/scale-in (Framer Motion) and a slim loading bar.
 */
export function StudentSplash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <BrandLogo className="h-16 w-16" />
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            NXTDRIVE Leerling
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Jouw rijopleiding in één overzicht
          </p>
        </div>
      </motion.div>
      <div className="mt-10 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full w-1/2 rounded-full bg-white/80"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
