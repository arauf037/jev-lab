"use client";

import type { ProviderStatus } from "@/lib/ai/decisionManager";

interface StatusIndicatorProps {
  status: ProviderStatus;
  demoMode: boolean;
  providerLabel: "jev" | "openai" | "mock" | "laya";
  inFlight: boolean;
  lastError: string | null;
  control?: "jev" | "openai" | "mock" | "fallback" | "local" | "laya";
  localModel?: "loading" | "ready" | "unavailable";
  openaiModel?: string;
}

export function StatusIndicator({
  status,
  demoMode,
  providerLabel,
  inFlight,
  lastError,
  control = "mock",
  localModel = "loading",
  openaiModel = "",
}: StatusIndicatorProps) {
  const localActive = status === "fallback" && control === "local";
  const offline = (status === "fallback" || status === "error") && !localActive;

  const label = localActive
    ? "LOCAL MODEL"
    : offline
      ? providerLabel === "openai"
        ? "GPT OFFLINE"
        : providerLabel === "laya"
          ? "LAYA OFFLINE"
          : "JEV OFFLINE"
    : providerLabel === "openai"
      ? "GPT PILOT"
      : providerLabel === "laya"
        ? "LAYA PILOT"
        : demoMode
          ? "DEMO MODE / MOCK JEV"
          : providerLabel === "jev"
            ? "LIVE JEV"
            : "MOCK JEV";

  const tone = localActive
    ? "border-violet-300/40 text-violet-200"
    : offline
    ? "border-rose-300/40 text-rose-200"
    : demoMode
      ? "border-amber-300/40 text-amber-200"
      : "border-emerald-300/40 text-emerald-200";

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${tone} bg-black/30`}>
      <div className="font-semibold tracking-[0.16em]">{label}</div>
      <div className="mt-1 text-slate-300">
        {providerLabel === "openai" && openaiModel ? `MODEL: ${openaiModel} · ` : ""}
        {providerLabel === "laya" ? "MODEL: typed-decisions · " : ""}
        {localActive
          ? providerLabel === "openai"
            ? "GPT TIMEOUT · LOCAL MODEL ACTIVE"
            : providerLabel === "laya"
              ? "LAYA TIMEOUT · LOCAL MODEL ACTIVE"
              : "JEV TIMEOUT · LOCAL MODEL ACTIVE"
          : offline
          ? "FALLBACK CONTROLLER ACTIVE"
          : inFlight
            ? "STATUS: THINKING"
            : "STATUS: READY"}
        {lastError ? ` · ${lastError}` : ""}
        {` · backup ${localModel}`}
      </div>
    </div>
  );
}
