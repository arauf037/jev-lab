import { NextResponse } from "next/server";
import { isValidTacticalState } from "@/lib/ai/decisionProvider";
import { callOpenAIDecision } from "@/lib/ai/openaiServer";
import { isOpenAIConfigured } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = body?.state;
    if (!isValidTacticalState(state)) {
      return NextResponse.json({ error: "Invalid tactical state" }, { status: 400 });
    }
    if (!isOpenAIConfigured()) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
    }
    const decision = await callOpenAIDecision(state);
    return NextResponse.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
