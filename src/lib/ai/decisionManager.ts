import { GAME_CONFIG } from "@/lib/game/constants";
import type {
  DecisionOutcome,
  DecisionRecord,
  DecisionTrace,
  GameMode,
  TacticalAction,
  TacticalState,
} from "@/lib/game/types";
import {
  decisionAgeMs,
  decisionIntervalFor,
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
  providerLabel: "jev" | "mock";
  phase: ControlPhase;
  control: "jev" | "mock" | "fallback" | "local";
  counts: DecisionCounts;
}

export class DecisionManager {
  private provider: TacticalDecisionProvider;
  private providerLabel: "jev" | "mock";
  private latestRequestId = 0;
  private activeRequestId = 0;
  private inFlight = false;
  private lastDecisionAt = 0;
  private previousRequestAt: number | null = null;
  private lastImpulseAt: number | null = null;
  private lastImpulseSource: "jev" | "mock" | "fallback" | "local" | null = null;
  private current: DecisionRecord | null = null;
  private lastEvent: DecisionRecord | null = null;
  private history: DecisionRecord[] = [];
  private status: ProviderStatus;
  private lastError: string | null = null;
  private phase: ControlPhase = "idle";
  private control: "jev" | "mock" | "fallback" | "local" = "mock";
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
    providerLabel: "jev" | "mock",
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
    };
  }

  setProvider(provider: TacticalDecisionProvider, label: "jev" | "mock"): void {
    this.provider = provider;
    this.providerLabel = label;
    this.control = label;
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
    if (!force && now - this.lastDecisionAt < decisionIntervalFor(state)) {
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
    } catch (error) {
      if (!this.owns(requestId)) {
        return this.discard(requestId, state, now, sessionId);
      }
      const live = this.liveState ?? state;
      const clock = this.clock(now);
      decision = await this.backup(live);
      const backupSource = decision.provider === "local" ? "local" : "fallback";
      const suppressed =
        decision.action === "flap" && this.blocksImpulse(backupSource, clock);
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
      return this.discard(requestId, state, now, sessionId, decision);
    }

    const live = this.liveState ?? state;
    const clock = this.clock(now);
    const age = decisionAgeMs(now, clock);
    const source =
      decision.provider === "local"
        ? "local"
        : decision.provider === "fallback"
          ? "fallback"
          : decision.provider === "mock"
            ? "mock"
            : "jev";
    const flapStale =
      decision.action === "flap" &&
      (age > GAME_CONFIG.maxDecisionAgeMs ||
        !isFlapStillRelevant(live) ||
        this.blocksImpulse(source, clock));
    const waitStale = decision.action === "wait" && age > GAME_CONFIG.maxDecisionAgeMs;

    if (mode !== "lab" && mode !== "manual" && (flapStale || waitStale)) {
      this.release(requestId);
      const dropped = this.seal(decision, state, requestId, "stale", now, false);
      dropped.trace.stale = true;
      dropped.trace.decisionAgeMs = age;
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

  private blocksImpulse(
    source: "jev" | "mock" | "fallback" | "local",
    now: number
  ): boolean {
    if (this.lastImpulseAt == null) return false;
    if (now - this.lastImpulseAt >= GAME_CONFIG.fallbackQuietMs) return false;
    if (source === "fallback" || source === "local") return true;
    return this.lastImpulseSource === "fallback" || this.lastImpulseSource === "local";
  }

  private discard(
    requestId: number,
    state: TacticalState,
    requestedAt: number,
    sessionId: number,
    decision?: TacticalDecision
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
    if (record.action === "flap") {
      this.lastImpulseAt = appliedAt;
      this.lastImpulseSource =
        record.provider === "local"
          ? "local"
          : record.provider === "fallback"
            ? "fallback"
            : record.provider === "mock"
              ? "mock"
              : "jev";
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
    fallback: boolean
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
        fallback ||
        Boolean(decision.isFallback) ||
        decision.provider === "fallback" ||
        decision.provider === "local",
      sessionId: this.sessionId,
    };
    return {
      id: `dec-${requestId}-${decision.timestamp}`,
      requestId,
      action: decision.action as TacticalAction,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      latencyMs: decision.latencyMs,
      provider: decision.provider,
      timestamp: decision.timestamp,
      tacticalState: state,
      outcome,
      isFallback:
        decision.isFallback ||
        decision.provider === "fallback" ||
        decision.provider === "local",
      sessionId: this.sessionId,
      trace,
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
