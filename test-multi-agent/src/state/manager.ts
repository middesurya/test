export class StateManager {
  private state = new Map<string, any>();
  private subs = new Map<string, Set<(v: any) => void>>();

  get<T>(key: string): T | undefined { return this.state.get(key); }

  set<T>(key: string, value: T): void {
    this.state.set(key, value);
    this.subs.get(key)?.forEach(cb => cb(value));
  }

  subscribe(key: string, cb: (v: any) => void): () => void {
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(cb);
    return () => this.subs.get(key)?.delete(cb);
  }
}
