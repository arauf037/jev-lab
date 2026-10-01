import { NextResponse } from "next/server";
import { isValidTacticalState } from "@/lib/ai/decisionProvider";
import { callJevDecision } from "@/lib/ai/jevServer";
import { getServerAiProvider, isJevConfigured } from "@/lib/config";
import { MockDecisionProvider } from "@/lib/ai/mockProvider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = body?.state;

    if (!isValidTacticalState(state)) {
      return NextResponse.json(
        { error: "Invalid tactical state" },
        { status: 400 }
      );
    }

    const provider = getServerAiProvider();

    if (provider === "mock" || !isJevConfigured()) {
      const mock = new MockDecisionProvider();
      const decision = await mock.decide(state);
      return NextResponse.json({
        ...decision,
        provider: "mock",
        demoMode: true,
      });
    }

    const decision = await callJevDecision(state);
    return NextResponse.json(decision);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Decision request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  const provider = getServerAiProvider();
  return NextResponse.json({
    provider,
    configured: isJevConfigured(),
    demoMode: provider === "mock" || !isJevConfigured(),
  });
}
