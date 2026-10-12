import { NextResponse } from "next/server";
import {
  getDecisionProvider,
  getOpenAIModel,
  getServerAiProvider,
  isJevConfigured,
  isLayaConfigured,
  isLlmConfigured,
  isOpenAIConfigured,
} from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const provider = getServerAiProvider();
  const decisionProvider = getDecisionProvider();
  return NextResponse.json({
    aiProvider: provider,
    decisionProvider,
    jevConfigured: isJevConfigured(),
    openaiConfigured: isOpenAIConfigured(),
    layaConfigured: isLayaConfigured(),
    openaiModel: getOpenAIModel(),
    demoMode: decisionProvider === "mock",
    llmConfigured: isLlmConfigured(),
  });
}
