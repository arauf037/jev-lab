export interface AnalystRequest {
  score: number;
  flightTimeSeconds: number;
  recentDecisions: Array<{
    action: "flap" | "wait";
    confidence?: number;
    latencyMs: number;
  }>;
  telemetry: {
    altitude: number;
    verticalVelocity: number;
    nextGateDistance: number;
    gapSize: number;
  };
}

export interface FlightAnalysis {
  summary: string;
  risk?: "low" | "medium" | "high";
  strategy?: string;
  generatedAt: number;
}

export interface FlightAnalystProvider {
  analyze(input: AnalystRequest): Promise<FlightAnalysis>;
}

export class LocalHeuristicAnalyst implements FlightAnalystProvider {
  async analyze(input: AnalystRequest): Promise<FlightAnalysis> {
    const descending = input.telemetry.verticalVelocity > 2.5;
    const tight = input.telemetry.gapSize < 150;
    const near = input.telemetry.nextGateDistance < 180;
    const risk: FlightAnalysis["risk"] = tight && near ? "high" : descending ? "medium" : "low";

    return {
      summary: descending && near
        ? "The drone is descending quickly and the next gate is relatively close. A more conservative flight pattern would reduce late corrections."
        : tight
          ? "Gate gaps are tightening. Favor earlier, smaller corrections instead of stacked late flaps."
          : "Flight path looks manageable. Keep aligning altitude with the upcoming gap center.",
      risk,
      strategy: risk === "high" ? "conservative" : risk === "medium" ? "balanced" : "steady",
      generatedAt: Date.now(),
    };
  }
}

export class HttpAnalystProvider implements FlightAnalystProvider {
  async analyze(input: AnalystRequest): Promise<FlightAnalysis> {
    const response = await fetch("/api/analyst", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Analyst HTTP ${response.status}`);
    }

    const data = (await response.json()) as Omit<FlightAnalysis, "generatedAt">;
    return {
      summary: data.summary,
      risk: data.risk,
      strategy: data.strategy,
      generatedAt: Date.now(),
    };
  }
}
