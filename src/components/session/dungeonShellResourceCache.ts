const rejectedProfileLeaves = new Map<string, unknown>();

export function rejectedProfileLeaf(url: string): unknown | undefined {
  return rejectedProfileLeaves.get(url);
}

export function rememberRejectedProfileLeaf(url: string, error: unknown): void {
  rejectedProfileLeaves.set(url, error);
}

export function clearRejectedProfileLeavesForTests(): void {
  rejectedProfileLeaves.clear();
}
