export interface TrackedRequest {
  id: number;
  url: string;
  startedAt: number;
  status: number | null;
  bytes: number | null;
  settledAt: number | null;
}
export interface RequestRange {
  label: string;
  startSequence: number;
  endSequence: number;
}
export class AttackDieRequestTracker {
  private sequence = 0;
  private records = new Map<object, TrackedRequest>();
  private pending = new Set<Promise<void>>();
  boundary() {
    return this.sequence;
  }
  start(identity: object, url: string, startedAt: number) {
    this.records.set(identity, {
      id: this.sequence++,
      url,
      startedAt,
      status: null,
      bytes: null,
      settledAt: null,
    });
  }
  trackSettlement(
    identity: object,
    settle: Promise<{ status: number; bytes: number | null; settledAt: number }>
  ) {
    const pending = settle
      .then((value) => this.settle(identity, value))
      .catch(() => undefined)
      .finally(() => this.pending.delete(pending));
    this.pending.add(pending);
  }
  settle(
    identity: object,
    input: { status: number; bytes: number | null; settledAt: number }
  ) {
    const record = this.records.get(identity);
    if (record) Object.assign(record, input);
  }
  closeRange(label: string, startSequence = 0): RequestRange {
    return { label, startSequence, endSequence: this.sequence };
  }
  materialize(range: RequestRange) {
    return [...this.records.values()]
      .filter((r) => r.id >= range.startSequence && r.id < range.endSequence)
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ ...r }));
  }
  async awaitSettlements(timeoutMs: number) {
    if (!this.pending.size) return;
    await Promise.race([
      Promise.allSettled([...this.pending]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
  sample(startedAt: number, endedAt: number) {
    return [...this.records.values()]
      .filter((r) => r.startedAt >= startedAt && r.startedAt < endedAt)
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ ...r }));
  }
}
