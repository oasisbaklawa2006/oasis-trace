/**
 * Trace-owned TV surfaces consumed by the unified Oasis Display APK.
 * Canonical build/enrollment authority: Oasis-Baklawa-Central/android-tv.
 */
export const TRACE_TV_DISPLAY_SURFACES = [
  {
    key: "trace-gate",
    label: "Trace Gate Display",
    route: "/tv/gate",
    certification: "canonical" as const,
    readOnly: true,
    sources: ["src/pages/TvGate.tsx", "src/lib/deviceSurfaceContract.ts"],
    tests: ["src/lib/deviceSurfaceRuntimePolicy.test.ts"],
  },
  {
    key: "trace-dispatch",
    label: "Trace Dispatch Display",
    route: "/tv/dispatch",
    certification: "canonical" as const,
    readOnly: true,
    sources: ["src/pages/TvDispatch.tsx", "src/lib/deviceSurfaceContract.ts"],
    tests: ["src/lib/deviceSurfaceRuntimePolicy.test.ts"],
  },
] as const;
