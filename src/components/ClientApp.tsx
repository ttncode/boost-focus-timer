"use client";

import dynamic from "next/dynamic";

/* Client-only: every surface reads localStorage on first render. */
export const ClientApp = dynamic(() => import("./BoostApp").then((m) => m.BoostApp), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-lg">Loading...</div>
    </div>
  ),
});
