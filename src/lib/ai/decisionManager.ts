import { GAME_CONFIG } from "@/lib/game/constants";
import type {
  DecisionOutcome,
  DecisionProviderName,
  DecisionRecord,
  DecisionTrace,
  GameMode,
  StaleReason,
  TacticalAction,
  TacticalState,
} from "@/lib/game/types";
import type { FlightSample, RecordedDecisionState } from "./benchmark";
import {
  decisionAgeMs,
  decisionIntervalForProvider,
  droneY,
  isFlapStillRelevant,
} from "./control";
import type {
  TacticalDecision,
  TacticalDecisionProvider,
} from "./decisionProvider";
import { createFallbackDecision } from "./jevProvider";
import { decideWithLocalModel } from "./localModel";

async function backupDecision(state: TacticalState): Promise<TacticalDecision> {
  try {
    const local = await decideWithLocalModel(state);
    if (local) return local;
  } catch {
    // The local model missed this call. The heuristic still answers.
  }
  return createFallbackDecision(state);
}

type PilotLabel = "jev" | "openai" | "mock" | "laya";
type ControlLabel = PilotLabel | "fallback" | "local";

function controlSource(provider: DecisionProviderName): ControlLabel {
  if (
    provider === "jev" ||
    provider === "openai" ||
    provider === "mock" ||
    provider === "fallback" ||
    provider === "local" ||
    provider === "laya"
  ) {
    return provider;
  }
  return "mock";
}

function failureMessage(error: unknown): string | null {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  ) {
    return null;
  }
  return error instanceof Error ? error.message : "Decision provider failed";
}

export type ProviderStatus =
  | "idle"
  | "ready"
  | "thinking"
  | "success"
  | "fallback"
  | "error"
  | "demo";

export type ControlPhase =
  | "idle"
  | "requested"
  | "in_flight"
  | "applied"
  | "discarded";

export interface DecisionCounts {
  requested: number;
  applied: number;
  stale: number;
  fallback: number;
}

export interface DecisionManagerSnapshot {
  current: DecisionRecord | null;
  lastEvent: DecisionRecord | null;
  history: DecisionRecord[];
  status: ProviderStatus;
  inFlight: boolean;
  lastError: string | null;
  providerLabel: PilotLabel;
  phase: ControlPhase;
  control: ControlLabel;
  counts: DecisionCounts;
  recordedStates: number;
}

export class DecisionManager {
  private provider: TacticalDecisionProvider;
  private providerLabel: PilotLabel;
  private latestRequestId = 0;
  private activeRequestId = 0;
  private inFlight = false;
  private lastDecisionAt = 0;
  private previousRequestAt: number | null = null;
  private lastImpulseAt: number | null = null;
  private lastImpulseSource: ControlLabel | null = null;
  private recentLatencyMs = 0;
  private tape: RecordedDecisionState[] = [];
  private lastTape: RecordedDecisionState[] = [];
  private samples: FlightSample[] = [];
  private lastSamples: FlightSample[] = [];
  private current: DecisionRecord | null = null;
  private lastEvent: DecisionRecord | null = null;
  private history: DecisionRecord[] = [];
  private status: ProviderStatus;
  private lastError: string | null = null;
  private phase: ControlPhase = "idle";
  private control: ControlLabel = "mock";
  private counts: DecisionCounts = {
    requested: 0,
    applied: 0,
    stale: 0,
    fallback: 0,
  };
  private listeners = new Set<() => void>();
  private onAppliedDecision: ((record: DecisionRecord) => void) | null = null;
  private sessionId = 0;
  private liveState: TacticalState | null = null;
  private liveNow = 0;
  private backup: (state: TacticalState) => Promise<TacticalDecision>;

  constructor(
    provider: TacticalDecisionProvider,
    providerLabel: PilotLabel,
    backup: (state: TacticalState) => Promise<TacticalDecision> = backupDecision
  ) {
    this.provider = provider;
    this.providerLabel = providerLabel;
    this.backup = backup;
    this.control = providerLabel;
    this.status = providerLabel === "mock" ? "demo" : "ready";
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDecisionApplied(handler: (record: DecisionRecord) => void): void {
    this.onAppliedDecision = handler;
  }

  /**
   * Called from the animation frame. A session change drops any response
   * that belongs to a previous flight.
   */
  sync(sessionId: number, state: TacticalState, now: number): void {
    if (sessionId !== this.sessionId) {
      if (this.tape.length > 0) this.lastTape = this.tape;
      if (this.samples.length > 0) this.lastSamples = this.samples;
      this.tape = [];
      this.samples = [];
      this.sessionId = sessionId;
      this.latestRequestId += 1;
      this.activeRequestId = 0;
      this.inFlight = false;
    }
    this.liveState = state;
    this.liveNow = now;
  }

  getSnapshot(): DecisionManagerSnapshot {
    return {
      current: this.current,
      lastEvent: this.lastEvent,
      history: this.history,
      status: this.status,
      inFlight: this.inFlight,
      lastError: this.lastError,
      providerLabel: this.providerLabel,
      phase: this.phase,
      control: this.control,
      counts: this.counts,
      recordedStates: this.tape.length > 0 ? this.tape.length : this.lastTape.length,
    };
  }

  getRecordedStates(): RecordedDecisionState[] {
    const source = this.tape.length > 0 ? this.tape : this.lastTape;
    return source.map((entry) => ({ ...entry, tacticalState: { ...entry.tacticalState } }));
  }

  getFlightSamples(): FlightSample[] {
    const source = this.samples.length > 0 ? this.samples : this.lastSamples;
    return source.slice();
  }

  setProvider(provider: TacticalDecisionProvider, label: PilotLabel): void {
    this.provider = provider;
    this.providerLabel = label;
    this.control = label;
    this.recentLatencyMs = 0;
    this.status = label === "mock" ? "demo" : "ready";
    this.emit();
  }

  maybeRequest(
    state: TacticalState,
    mode: GameMode,
    now: number,
    force = false
  ): void {
    if (!state.droneAlive && mode !== "lab") return;
    if (this.inFlight) return;
    if (
      !force &&
      now - this.lastDecisionAt <
        decisionIntervalForProvider(state, this.providerLabel, this.recentLatencyMs)
    ) {
      return;
    }

    void this.requestDecision(state, mode, now, force);
  }

  async requestDecision(
    state: TacticalState,
    mode: GameMode,
    now: number,
    force = false
  ): Promise<DecisionRecord> {
    if (this.inFlight && !force) {
      return (
        this.current ??
        this.lastEvent ??
        this.seal(
          createFallbackDecision(state),
          state,
          this.latestRequestId,
          "pending",
          now,
          false
        )
      );
    }

    const requestId = ++this.latestRequestId;
    const sessionId = this.sessionId;
    this.activeRequestId = requestId;
    this.inFlight = true;
    this.phase = "in_flight";
    this.status = "thinking";
    this.lastError = null;
    this.previousRequestAt = this.lastDecisionAt || null;
    this.lastDecisionAt = now;
    this.counts.requested += 1;
    if (mode !== "lab" && mode !== "manual" && mode !== "compare") {
      this.tape.push({
        sequence: this.tape.length + 1,
        timestamp: now,
        tacticalState: state,
      });
      if (this.tape.length > 500) this.tape.shift();
    }
    this.emit();

    let decision: TacticalDecision;
    let outcome: DecisionOutcome =
      mode === "manual"
        ? "ignored_manual"
        : mode === "lab"
          ? "lab_only"
          : "pending";

    try {
      decision = await this.provider.decide(state);
      if (typeof decision.latencyMs === "number" && Number.isFinite(decision.latencyMs)) {
        this.recentLatencyMs = decision.latencyMs;
      }
    } catch (error) {
      if (!this.owns(requestId)) {
        return this.discard(requestId, state, now, sessionId, undefined, "replaced");
      }
      const live = this.liveState ?? state;
      const clock = this.clock(now);
      decision = await this.backup(live);
      const backupSource = decision.provider === "local" ? "local" : "fallback";
      const suppressed =
        decision.action === "flap" && this.blocksImpulse(backupSource, clock, live);
      if (suppressed || mode === "lab" || mode === "manual") {
        this.release(requestId);
        const dropped = this.seal(
          decision,
          live,
          requestId,
          suppressed ? "stale" : "fallback",
          now,
          !suppressed
        );
        if (suppressed) {
          dropped.trace.stale = true;
          dropped.stale = true;
          dropped.staleReason = "second_flap";
          this.counts.stale += 1;
          this.phase = "discarded";
          this.status = this.current?.provider === "jev" ? "success" : this.status;
        } else {
          this.counts.fallback += 1;
          this.status = "fallback";
          this.control = backupSource;
          this.phase = "applied";
          this.lastError = failureMessage(error);
        }
        this.remember(dropped, !suppressed && mode !== "lab");
        return dropped;
      }
      outcome = "fallback";
      this.counts.fallback += 1;
      this.status = "fallback";
      this.control = decision.provider === "local" ? "local" : "fallback";
      this.lastError = failureMessage(error);
      const record = this.seal(decision, live, requestId, outcome, now, true);
      this.release(requestId);
      this.publish(record, live, clock);
      return record;
    }

    if (!this.owns(requestId) || sessionId !== this.sessionId) {
      return this.discard(
        requestId,
        state,
        now,
        sessionId,
        decision,
        sessionId !== this.sessionId ? "previous_flight" : "replaced"
      );
    }

    const live = this.liveState ?? state;
    const clock = this.clock(now);
    const age = decisionAgeMs(now, clock);
    const source = controlSource(decision.provider);
    const flapReason =
      decision.action === "flap"
        ? this.flapStaleReason(age, live, state, source, clock)
        : null;
    const waitStale = decision.action === "wait" && age > GAME_CONFIG.maxDecisionAgeMs;

    if (mode !== "lab" && mode !== "manual" && (flapReason != null || waitStale)) {
      this.release(requestId);
      const dropped = this.seal(decision, state, requestId, "stale", now, false);
      dropped.trace.stale = true;
      dropped.trace.decisionAgeMs = age;
      dropped.stale = true;
      dropped.staleReason = flapReason ?? "too_old";
      dropped.decisionAgeMs = age;
      this.counts.stale += 1;
      this.phase = "discarded";
      this.status =
        decision.provider === "mock"
          ? "demo"
          : this.current?.provider === "fallback"
            ? "fallback"
            : "success";
      this.remember(dropped, false);
      return dropped;
    }

    this.status =
      decision.provider === "mock"
        ? "demo"
        : decision.provider === "fallback" || decision.isFallback
          ? "fallback"
          : "success";
    if (decision.provider === "local") {
      this.control = "local";
      this.counts.fallback += 1;
    } else if (decision.provider === "fallback" || decision.isFallback) {
      this.control = "fallback";
      this.counts.fallback += 1;
    } else if (decision.provider === "openai") {
      this.control = "openai";
    } else if (decision.provider === "laya") {
      this.control = "laya";
    } else if (decision.provider === "jev") {
      this.control = "jev";
    } else {
      this.control = "mock";
    }
    this.lastError = null;

    const record = this.seal(decision, state, requestId, outcome, now, false);
    this.release(requestId);
    if (mode === "lab" || mode === "manual") {
      this.remember(record, false);
      return record;
    }
    this.publish(record, live, clock);
    return record;
  }

  async runLabDecision(state: TacticalState): Promise<DecisionRecord> {
    return this.requestDecision(state, "lab", this.liveNow || Date.now(), true);
  }

  markOutcome(outcome: DecisionOutcome): void {
    if (!this.current) return;
    this.current = { ...this.current, outcome };
    this.history = this.history.map((item) =>
      item.id === this.current?.id ? this.current! : item
    );
    this.emit();
  }

  private owns(requestId: number): boolean {
    return requestId === this.latestRequestId && requestId === this.activeRequestId;
  }

  private release(requestId: number): void {
    if (this.activeRequestId === requestId) {
      this.inFlight = false;
      this.activeRequestId = 0;
    }
  }

  private clock(requestedAt: number): number {
    return Math.max(this.liveNow, requestedAt);
  }

  private flapStaleReason(
    age: number,
    live: TacticalState,
    requested: TacticalState,
    source: ControlLabel,
    now: number
  ): StaleReason | null {
    if (age > GAME_CONFIG.maxDecisionAgeMs) return "too_old";
    if (!isFlapStillRelevant(live, requested)) return "above_opening";
    if (this.blocksImpulse(source, now, live)) return "second_flap";
    return null;
  }

  /**
   * Suppress stacked flaps inside the quiet window.
   * Backup controllers never stack on a fresh impulse.
   * Primary pilots may correct while still below center or near the floor;
   * once on/above center, further flaps inside the quiet window are discarded.
   */
  private blocksImpulse(source: ControlLabel, now: number, live: TacticalState): boolean {
    if (this.lastImpulseAt == null) return false;
    if (now - this.lastImpulseAt >= GAME_CONFIG.fallbackQuietMs) return false;
    if (source === "fallback" || source === "local") return true;
    if (live.altitude < 80 || live.relativeGapOffset > 8) return false;
    return true;
  }

  private discard(
    requestId: number,
    state: TacticalState,
    requestedAt: number,
    sessionId: number,
    decision?: TacticalDecision,
    reason: StaleReason = "previous_flight"
  ): DecisionRecord {
    this.release(requestId);
    const dropped = this.seal(
      decision ?? createFallbackDecision(state),
      state,
      requestId,
      "stale",
      requestedAt,
      false
    );
    dropped.sessionId = sessionId;
    dropped.trace.sessionId = sessionId;
    dropped.trace.stale = true;
    dropped.stale = true;
    dropped.staleReason = reason;
    this.counts.stale += 1;
    this.phase = "discarded";
    this.remember(dropped, false);
    return dropped;
  }

  private publish(record: DecisionRecord, live: TacticalState, appliedAt: number): void {
    record.trace.decisionAppliedAt = appliedAt;
    record.trace.decisionAgeMs = decisionAgeMs(record.trace.decisionRequestedAt, appliedAt);
    record.trace.droneYAtApply = droneY(live);
    record.trace.droneVelocityAtApply = live.verticalVelocity;
    record.trace.nextGateDistanceAtApply = live.nextGateDistance;
    record.outcome = record.outcome === "pending" ? "pending" : record.outcome;
    record.appliedAt = appliedAt;
    record.decisionAgeMs = record.trace.decisionAgeMs;
    record.stale = record.trace.stale;
    record.fallback = record.trace.fallback;
    if (record.action === "flap") {
      this.lastImpulseAt = appliedAt;
      this.lastImpulseSource = controlSource(record.provider);
    }
    this.counts.applied += 1;
    this.phase = "applied";
    this.current = record;
    this.remember(record, true);
    if (
      (record.outcome === "pending" || record.outcome === "fallback") &&
      this.onAppliedDecision
    ) {
      this.onAppliedDecision(record);
    }
  }

  private remember(record: DecisionRecord, applied: boolean): void {
    if (record.outcome !== "lab_only" && record.outcome !== "ignored_manual") {
      this.samples.push({
        provider: record.provider,
        action: record.action,
        latencyMs: record.latencyMs,
        decisionAgeMs: record.decisionAgeMs,
        stale: record.stale,
        staleReason: record.staleReason,
        fallback: record.fallback,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalTokens: record.totalTokens,
        estimatedCostUsd: record.estimatedCostUsd,
        reportedCostUsd: record.reportedCostUsd,
      });
      if (this.samples.length > 500) this.samples.shift();
    }
    this.lastEvent = record;
    if (applied) this.current = record;
    this.history = [record, ...this.history].slice(0, GAME_CONFIG.maxDecisionHistory);
    this.emit();
  }

  private seal(
    decision: TacticalDecision,
    state: TacticalState,
    requestId: number,
    outcome: DecisionOutcome,
    requestedAt: number,
    fallbackFlag: boolean
  ): DecisionRecord {
    const receivedAt = this.clock(requestedAt);
    const trace: DecisionTrace = {
      decisionRequestedAt: requestedAt,
      gameStateCapturedAt: requestedAt,
      jevRequestSentAt: requestedAt,
      jevResponseReceivedAt: receivedAt,
      decisionAppliedAt: null,
      requestLatencyMs: decision.latencyMs,
      decisionAgeMs: decisionAgeMs(requestedAt, receivedAt),
      timeSincePreviousDecisionMs: this.previousRequestAt
        ? requestedAt - this.previousRequestAt
        : null,
      droneYAtRequest: droneY(state),
      droneVelocityAtRequest: state.verticalVelocity,
      droneYAtApply: null,
      droneVelocityAtApply: null,
      nextGateDistanceAtRequest: state.nextGateDistance,
      nextGateDistanceAtApply: null,
      stale: outcome === "stale",
      fallback:
        fallbackFlag ||
        Boolean(decision.isFallback) ||
        decision.provider === "fallback" ||
        decision.provider === "local",
      sessionId: this.sessionId,
    };
    const id = `dec-${requestId}-${decision.timestamp}`;
    const fallback =
      fallbackFlag ||
      Boolean(decision.isFallback) ||
      decision.provider === "fallback" ||
      decision.provider === "local";
    return {
      id,
      decisionId: id,
      requestId,
      action: decision.action as TacticalAction,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      latencyMs: decision.latencyMs,
      provider: decision.provider,
      timestamp: decision.timestamp,
      tacticalState: state,
      outcome,
      isFallback: fallback,
      sessionId: this.sessionId,
      trace,
      model: decision.model,
      requestStartedAt: requestedAt,
      responseReceivedAt: receivedAt,
      stateCapturedAt: requestedAt,
      decisionAgeMs: trace.decisionAgeMs,
      inputTokens: decision.inputTokens,
      outputTokens: decision.outputTokens,
      totalTokens: decision.totalTokens,
      estimatedCostUsd: decision.estimatedCostUsd,
      reportedCostUsd: decision.reportedCostUsd,
      stale: outcome === "stale",
      fallback,
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
