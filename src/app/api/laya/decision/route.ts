import { NextResponse } from "next/server";
import { isValidTacticalState } from "@/lib/ai/decisionProvider";
import { callLayaDecision } from "@/lib/ai/jevServer";
import { isLayaConfigured } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = body?.state;
    if (!isValidTacticalState(state)) {
      return NextResponse.json({ error: "Invalid tactical state" }, { status: 400 });
    }
    if (!isLayaConfigured()) {
      return NextResponse.json({ error: "Laya sidecar is not configured" }, { status: 503 });
    }
    const decision = await callLayaDecision(state);
    return NextResponse.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
