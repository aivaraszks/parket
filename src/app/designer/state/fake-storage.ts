// An in-memory Storage for specs; `failWhen` makes selected writes throw like a full quota.

export class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  /** Return true to make `setItem(key)` throw. */
  failWhen: (key: string) => boolean = () => false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWhen(key)) {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    }
    this.map.set(key, value);
  }
}
