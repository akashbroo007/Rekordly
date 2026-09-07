import type { SettingsRepo } from '@rekordly/database';

export interface ConfigLayer {
  /** Immutable application defaults. */
  defaults: Record<string, unknown>;
  /** User preferences persisted in the settings table. */
  user: SettingsRepo;
}

/**
 * Centralized configuration with three layers:
 * defaults (application) < user (persisted) < runtime (in-memory overrides).
 * Reads walk the layers; writes always land in the user layer.
 */
export class ConfigManager {
  private readonly runtime = new Map<string, unknown>();

  constructor(private readonly layers: ConfigLayer) {}

  get<T>(key: string): T | undefined {
    if (this.runtime.has(key)) {
      return this.runtime.get(key) as T | undefined;
    }
    const stored = this.layers.user.get<T>(key);
    if (stored !== undefined) {
      return stored;
    }
    return this.layers.defaults[key] as T | undefined;
  }

  getAll(): Record<string, unknown> {
    return { ...this.layers.defaults, ...this.layers.user.getAll(), ...Object.fromEntries(this.runtime) };
  }

  setUser(key: string, value: unknown): void {
    this.layers.user.set(key, value);
  }

  /** Runtime overrides (not persisted); cleared on restart. */
  setRuntime(key: string, value: unknown): void {
    this.runtime.set(key, value);
  }

  clearRuntime(key: string): void {
    this.runtime.delete(key);
  }

  resetUser(): void {
    this.layers.user.reset();
  }
}
