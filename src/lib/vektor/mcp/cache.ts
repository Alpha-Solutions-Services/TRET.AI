export class IdCache<T> {
  private readonly map = new Map<string, T>();

  get(id: string): T | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  remember(id: string, value: T): void {
    if (!this.map.has(id)) {
      this.map.set(id, value);
    }
  }

  entries(): Array<[string, T]> {
    return [...this.map.entries()];
  }
}
