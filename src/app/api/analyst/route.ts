import { NextResponse } from "next/server";
import { isLlmConfigured } from "@/lib/config";
import type { AnalystRequest, FlightAnalysis } from "@/lib/ai/llmAnalyst";
import { LocalHeuristicAnalyst } from "@/lib/ai/llmAnalyst";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalystRequest;

    if (
      typeof body.score !== "number" ||
      typeof body.flightTimeSeconds !== "number" ||
      !body.telemetry
    ) {
      return NextResponse.json({ error: "Invalid analyst request" }, { status: 400 });
    }

    if (!isLlmConfigured()) {
      const local = new LocalHeuristicAnalyst();
      const analysis = await local.analyze(body);
      return NextResponse.json({
        ...analysis,
        provider: "local",
        configured: false,
      });
    }

    const analysis = await callLlmAnalyst(body);
    return NextResponse.json({
      ...analysis,
      provider: process.env.LLM_PROVIDER ?? "openai",
      configured: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analyst request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isLlmConfigured(),
    provider: process.env.LLM_PROVIDER ?? null,
  });
}

async function callLlmAnalyst(input: AnalystRequest): Promise<FlightAnalysis> {
  const apiKey = process.env.LLM_API_KEY!;
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();

  const system = `You are the Flight Analyst for a game AI system.
You do not control the drone.
Analyze only the telemetry provided.
Do not invent facts.
Return concise structured guidance as JSON with keys: summary, risk (low|medium|high), strategy.
Focus on recent tactical behaviour, risk, flight stability, and whether strategy should be more conservative or aggressive.
Do not output JavaScript or game commands.`;

  const user = JSON.stringify(input);

  if (provider === "openai" || provider === "openrouter") {
    const baseUrl =
      provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM returned empty content");
    }

    const parsed = JSON.parse(content) as {
      summary?: string;
      risk?: "low" | "medium" | "high";
      strategy?: string;
    };

    if (!parsed.summary) {
      throw new Error("LLM response missing summary");
    }

    return {
      summary: parsed.summary,
      risk: parsed.risk,
      strategy: parsed.strategy,
      generatedAt: Date.now(),
    };
  }

  // Unknown provider: fall back to local heuristic
  const local = new LocalHeuristicAnalyst();
  return local.analyze(input);
}
