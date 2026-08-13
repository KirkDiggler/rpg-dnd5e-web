export interface TrackedRequest {
  id: number;
  url: string;
  startedAt: number;
  status: number | null;
  bytes: number | null;
  settledAt: number | null;
}
export class AttackDieRequestTracker {
  private sequence = 0;
  private records = new Map<object, TrackedRequest>();
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
  settle(
    identity: object,
    input: { status: number; bytes: number | null; settledAt: number }
  ) {
    const record = this.records.get(identity);
    if (!record) return;
    Object.assign(record, input);
  }
  sample(startedAt: number, endedAt: number) {
    return [...this.records.values()]
      .filter((r) => r.startedAt >= startedAt && r.startedAt < endedAt)
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ ...r }));
  }
}
