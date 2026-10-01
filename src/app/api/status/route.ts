import { NextResponse } from "next/server";
import {
  getServerAiProvider,
  isJevConfigured,
  isLlmConfigured,
} from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const provider = getServerAiProvider();
  return NextResponse.json({
    aiProvider: provider,
    jevConfigured: isJevConfigured(),
    demoMode: provider === "mock" || !isJevConfigured(),
    llmConfigured: isLlmConfigured(),
  });
}
