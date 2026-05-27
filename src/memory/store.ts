import fs from 'fs/promises';
import path from 'path';

const MEMORY_FILE = './data/memory.json';
const DEFAULTS_FILE = './data/defaults.json';

export interface WorkingCombo {
  customerId: string;
  glAccountNo?: string;
  accountLabel?: string;
  locationId?: string;
  departmentId?: string;
  lastUsed: string;
  successCount: number;
}

export interface Memory {
  workingCombos: WorkingCombo[];
  failedCombos: Array<{
    combo: Partial<WorkingCombo>;
    error: string;
    timestamp: string;
  }>;
  defaultCustomerId?: string;
  defaultGlAccountNo?: string;
  defaultAccountLabel?: string;
  defaultLocationId?: string;
}

export interface Defaults {
  customerId?: string;
  glAccountNo?: string;
  accountLabel?: string;
  locationId?: string | number;
  departmentId?: string | number;
  currency?: string;
  termName?: string;
  defaultAmount?: number;
}

/**
 * Memory Store - Persists learned combinations and defaults
 */
export class MemoryStore {
  private memory: Memory = {
    workingCombos: [],
    failedCombos: [],
  };
  private defaults: Defaults = {};
  private loaded = false;

  /**
   * Load memory from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const memoryData = await fs.readFile(MEMORY_FILE, 'utf-8');
      this.memory = JSON.parse(memoryData);
    } catch {
      // File doesn't exist, use defaults
      this.memory = { workingCombos: [], failedCombos: [] };
    }

    try {
      const defaultsData = await fs.readFile(DEFAULTS_FILE, 'utf-8');
      this.defaults = JSON.parse(defaultsData);
    } catch {
      // File doesn't exist, use empty defaults
      this.defaults = {};
    }

    this.loaded = true;
  }

  /**
   * Save memory to disk
   */
  async save(): Promise<void> {
    await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
    await fs.writeFile(MEMORY_FILE, JSON.stringify(this.memory, null, 2));
  }

  /**
   * Save defaults to disk
   */
  async saveDefaults(): Promise<void> {
    await fs.mkdir(path.dirname(DEFAULTS_FILE), { recursive: true });
    await fs.writeFile(DEFAULTS_FILE, JSON.stringify(this.defaults, null, 2));
  }

  /**
   * Record a successful combination
   */
  async recordSuccess(combo: Omit<WorkingCombo, 'lastUsed' | 'successCount'>): Promise<void> {
    await this.load();

    // Find existing combo
    const existing = this.memory.workingCombos.find(
      c => c.customerId === combo.customerId && 
           c.glAccountNo === combo.glAccountNo &&
           c.accountLabel === combo.accountLabel &&
           c.locationId === combo.locationId
    );

    if (existing) {
      existing.successCount++;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.memory.workingCombos.push({
        ...combo,
        lastUsed: new Date().toISOString(),
        successCount: 1,
      });
    }

    // Update defaults if this is the most successful combo
    const sorted = [...this.memory.workingCombos].sort((a, b) => b.successCount - a.successCount);
    if (sorted.length > 0) {
      const best = sorted[0];
      this.memory.defaultCustomerId = best.customerId;
      this.memory.defaultGlAccountNo = best.glAccountNo;
      this.memory.defaultAccountLabel = best.accountLabel;
      this.memory.defaultLocationId = best.locationId;
    }

    await this.save();
  }

  /**
   * Record a failed combination
   */
  async recordFailure(combo: Partial<WorkingCombo>, error: string): Promise<void> {
    await this.load();

    this.memory.failedCombos.push({
      combo,
      error,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 100 failures
    if (this.memory.failedCombos.length > 100) {
      this.memory.failedCombos = this.memory.failedCombos.slice(-100);
    }

    await this.save();
  }

  /**
   * Get best known working combo for a customer
   */
  async getBestCombo(customerId?: string): Promise<WorkingCombo | null> {
    await this.load();

    let combos = this.memory.workingCombos;
    
    if (customerId) {
      combos = combos.filter(c => c.customerId === customerId);
    }

    if (combos.length === 0) {
      return null;
    }

    // Sort by success count, then by last used
    combos.sort((a, b) => {
      if (b.successCount !== a.successCount) {
        return b.successCount - a.successCount;
      }
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });

    return combos[0];
  }

  /**
   * Get defaults
   */
  async getDefaults(): Promise<Defaults> {
    await this.load();
    return { ...this.defaults };
  }

  /**
   * Set defaults
   */
  async setDefaults(newDefaults: Partial<Defaults>): Promise<void> {
    await this.load();
    this.defaults = { ...this.defaults, ...newDefaults };
    await this.saveDefaults();
  }

  /**
   * Get memory state
   */
  async getMemory(): Promise<Memory> {
    await this.load();
    return { ...this.memory };
  }

  /**
   * Check if a combo has failed before
   */
  async hasFailedBefore(combo: Partial<WorkingCombo>): Promise<boolean> {
    await this.load();

    return this.memory.failedCombos.some(
      f => f.combo.customerId === combo.customerId &&
           f.combo.glAccountNo === combo.glAccountNo &&
           f.combo.locationId === combo.locationId
    );
  }

  /**
   * Get alternative combos to try after a failure
   */
  async getAlternativeCombos(
    failedCombo: Partial<WorkingCombo>,
    limit = 3
  ): Promise<WorkingCombo[]> {
    await this.load();

    // Get combos that worked but with different GL accounts or locations
    const alternatives = this.memory.workingCombos
      .filter(c => 
        c.customerId === failedCombo.customerId &&
        (c.glAccountNo !== failedCombo.glAccountNo || c.locationId !== failedCombo.locationId)
      )
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, limit);

    return alternatives;
  }
}

// Singleton instance
let storeInstance: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!storeInstance) {
    storeInstance = new MemoryStore();
  }
  return storeInstance;
}
