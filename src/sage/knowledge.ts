/**
 * Knowledge Store
 * Tracks working configurations and bad values learned from Sage errors
 */

import fs from 'fs/promises';
import path from 'path';

const KNOWLEDGE_FILE = './data/knowledge.json';

export interface SuccessfulCombo {
  customerId: string;
  glAccountNo?: string;
  currency?: string;
  locationId?: string;
  departmentId?: string;
  createdAt: string;
}

export interface ActionKnowledge {
  workingDefaults: {
    customerId?: string;
    glAccountNo?: string;
    currency?: string;
    locationId?: string;
    departmentId?: string;
  };
  badValues: {
    customerIds: string[];
    glAccountNos: string[];
    locationIds: string[];
    departmentIds: string[];
  };
  successfulCombos: SuccessfulCombo[];
}

export interface Knowledge {
  invoice: ActionKnowledge;
  payment: ActionKnowledge;
  lastUpdated: string;
}

const DEFAULT_KNOWLEDGE: Knowledge = {
  invoice: {
    workingDefaults: {},
    badValues: {
      customerIds: [],
      glAccountNos: [],
      locationIds: [],
      departmentIds: [],
    },
    successfulCombos: [],
  },
  payment: {
    workingDefaults: {},
    badValues: {
      customerIds: [],
      glAccountNos: [],
      locationIds: [],
      departmentIds: [],
    },
    successfulCombos: [],
  },
  lastUpdated: new Date().toISOString(),
};

/**
 * Knowledge Store class
 */
export class KnowledgeStore {
  private knowledge: Knowledge = structuredClone(DEFAULT_KNOWLEDGE);
  private loaded = false;

  /**
   * Load knowledge from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(KNOWLEDGE_FILE, 'utf-8');
      const parsed = JSON.parse(data) as Partial<Knowledge>;
      
      // Merge with defaults to handle missing fields
      this.knowledge = {
        invoice: {
          workingDefaults: { ...DEFAULT_KNOWLEDGE.invoice.workingDefaults, ...parsed.invoice?.workingDefaults },
          badValues: {
            customerIds: parsed.invoice?.badValues?.customerIds || [],
            glAccountNos: parsed.invoice?.badValues?.glAccountNos || [],
            locationIds: parsed.invoice?.badValues?.locationIds || [],
            departmentIds: parsed.invoice?.badValues?.departmentIds || [],
          },
          successfulCombos: parsed.invoice?.successfulCombos || [],
        },
        payment: {
          workingDefaults: { ...DEFAULT_KNOWLEDGE.payment.workingDefaults, ...parsed.payment?.workingDefaults },
          badValues: {
            customerIds: parsed.payment?.badValues?.customerIds || [],
            glAccountNos: parsed.payment?.badValues?.glAccountNos || [],
            locationIds: parsed.payment?.badValues?.locationIds || [],
            departmentIds: parsed.payment?.badValues?.departmentIds || [],
          },
          successfulCombos: parsed.payment?.successfulCombos || [],
        },
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
    } catch {
      this.knowledge = structuredClone(DEFAULT_KNOWLEDGE);
    }

    this.loaded = true;
  }

  /**
   * Save knowledge to disk
   */
  async save(): Promise<void> {
    this.knowledge.lastUpdated = new Date().toISOString();
    await fs.mkdir(path.dirname(KNOWLEDGE_FILE), { recursive: true });
    await fs.writeFile(KNOWLEDGE_FILE, JSON.stringify(this.knowledge, null, 2));
  }

  /**
   * Get knowledge for an action type
   */
  async getActionKnowledge(action: 'invoice' | 'payment'): Promise<ActionKnowledge> {
    await this.load();
    return this.knowledge[action];
  }

  /**
   * Mark a value as bad (don't use it again)
   */
  async markBadValue(
    action: 'invoice' | 'payment',
    type: 'customerId' | 'glAccountNo' | 'locationId' | 'departmentId',
    value: string
  ): Promise<void> {
    await this.load();

    const badList = this.knowledge[action].badValues;
    const key = `${type}s` as keyof typeof badList;
    
    if (!badList[key].includes(value)) {
      badList[key].push(value);
      await this.save();
    }
  }

  /**
   * Check if a value is known to be bad
   */
  async isBadValue(
    action: 'invoice' | 'payment',
    type: 'customerId' | 'glAccountNo' | 'locationId' | 'departmentId',
    value: string
  ): Promise<boolean> {
    await this.load();

    const badList = this.knowledge[action].badValues;
    const key = `${type}s` as keyof typeof badList;
    
    return badList[key].includes(value);
  }

  /**
   * Record a successful combination (only call after actual success!)
   */
  async recordSuccess(
    action: 'invoice' | 'payment',
    combo: Omit<SuccessfulCombo, 'createdAt'>
  ): Promise<void> {
    await this.load();

    const actionKnowledge = this.knowledge[action];

    // Update working defaults
    if (combo.customerId) actionKnowledge.workingDefaults.customerId = combo.customerId;
    if (combo.glAccountNo) actionKnowledge.workingDefaults.glAccountNo = combo.glAccountNo;
    if (combo.currency) actionKnowledge.workingDefaults.currency = combo.currency;
    if (combo.locationId) actionKnowledge.workingDefaults.locationId = combo.locationId;
    if (combo.departmentId) actionKnowledge.workingDefaults.departmentId = combo.departmentId;

    // Add to successful combos
    actionKnowledge.successfulCombos.push({
      ...combo,
      createdAt: new Date().toISOString(),
    });

    // Keep only last 50 successful combos
    if (actionKnowledge.successfulCombos.length > 50) {
      actionKnowledge.successfulCombos = actionKnowledge.successfulCombos.slice(-50);
    }

    await this.save();
  }

  /**
   * Get the full knowledge state (for display)
   */
  async getKnowledge(): Promise<Knowledge> {
    await this.load();
    return structuredClone(this.knowledge);
  }

  /**
   * Clear all knowledge (reset)
   */
  async clear(): Promise<void> {
    this.knowledge = structuredClone(DEFAULT_KNOWLEDGE);
    await this.save();
  }
}

// Singleton instance
let storeInstance: KnowledgeStore | null = null;

export function getKnowledgeStore(): KnowledgeStore {
  if (!storeInstance) {
    storeInstance = new KnowledgeStore();
  }
  return storeInstance;
}
