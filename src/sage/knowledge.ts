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

export interface PaymentSuccessfulCombo {
  customerId: string;
  bankAccountId?: string;
  paymentMethod?: string;
  currency?: string;
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

export interface PaymentKnowledge {
  workingDefaults: {
    bankAccountId?: string;
    paymentMethod?: string;
    currency?: string;
  };
  badValues: {
    bankAccountIds: string[];
    paymentMethods: string[];
  };
  successfulCombos: PaymentSuccessfulCombo[];
}

export interface Knowledge {
  invoice: ActionKnowledge;
  payment: PaymentKnowledge;
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
      bankAccountIds: [],
      paymentMethods: [],
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
          workingDefaults: { ...DEFAULT_KNOWLEDGE.payment.workingDefaults, ...(parsed.payment?.workingDefaults as PaymentKnowledge['workingDefaults']) },
          badValues: {
            bankAccountIds: (parsed.payment?.badValues as PaymentKnowledge['badValues'])?.bankAccountIds || [],
            paymentMethods: (parsed.payment?.badValues as PaymentKnowledge['badValues'])?.paymentMethods || [],
          },
          successfulCombos: (parsed.payment?.successfulCombos as PaymentSuccessfulCombo[]) || [],
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
   * Get knowledge for invoice action
   */
  async getInvoiceKnowledge(): Promise<ActionKnowledge> {
    await this.load();
    return this.knowledge.invoice;
  }

  /**
   * Get knowledge for payment action
   */
  async getPaymentKnowledge(): Promise<PaymentKnowledge> {
    await this.load();
    return this.knowledge.payment;
  }

  /**
   * Get knowledge for an action type (backwards compatible)
   */
  async getActionKnowledge(action: 'invoice'): Promise<ActionKnowledge>;
  async getActionKnowledge(action: 'payment'): Promise<PaymentKnowledge>;
  async getActionKnowledge(action: 'invoice' | 'payment'): Promise<ActionKnowledge | PaymentKnowledge> {
    await this.load();
    return this.knowledge[action];
  }

  /**
   * Mark a value as bad for invoice operations
   */
  async markInvoiceBadValue(
    type: 'customerId' | 'glAccountNo' | 'locationId' | 'departmentId',
    value: string
  ): Promise<void> {
    await this.load();
    const badList = this.knowledge.invoice.badValues;
    const key = `${type}s` as keyof typeof badList;
    if (!badList[key].includes(value)) {
      badList[key].push(value);
      await this.save();
    }
  }

  /**
   * Mark a value as bad for payment operations
   */
  async markPaymentBadValue(
    type: 'bankAccountId' | 'paymentMethod',
    value: string
  ): Promise<void> {
    await this.load();
    const badList = this.knowledge.payment.badValues;
    const key = `${type}s` as keyof typeof badList;
    if (!badList[key].includes(value)) {
      badList[key].push(value);
      await this.save();
    }
  }

  /**
   * Mark a value as bad (backwards compatible - invoice only)
   */
  async markBadValue(
    action: 'invoice',
    type: 'customerId' | 'glAccountNo' | 'locationId' | 'departmentId',
    value: string
  ): Promise<void> {
    await this.markInvoiceBadValue(type, value);
  }

  /**
   * Check if a value is known to be bad for payments
   */
  async isPaymentBadValue(
    type: 'bankAccountId' | 'paymentMethod',
    value: string
  ): Promise<boolean> {
    await this.load();
    const badList = this.knowledge.payment.badValues;
    const key = `${type}s` as keyof typeof badList;
    return badList[key].includes(value);
  }

  /**
   * Check if a value is known to be bad (backwards compatible - invoice only)
   */
  async isBadValue(
    action: 'invoice',
    type: 'customerId' | 'glAccountNo' | 'locationId' | 'departmentId',
    value: string
  ): Promise<boolean> {
    await this.load();
    const badList = this.knowledge.invoice.badValues;
    const key = `${type}s` as keyof typeof badList;
    return badList[key].includes(value);
  }

  /**
   * Record a successful invoice combination
   */
  async recordInvoiceSuccess(combo: Omit<SuccessfulCombo, 'createdAt'>): Promise<void> {
    await this.load();
    const k = this.knowledge.invoice;

    if (combo.customerId) k.workingDefaults.customerId = combo.customerId;
    if (combo.glAccountNo) k.workingDefaults.glAccountNo = combo.glAccountNo;
    if (combo.currency) k.workingDefaults.currency = combo.currency;
    if (combo.locationId) k.workingDefaults.locationId = combo.locationId;
    if (combo.departmentId) k.workingDefaults.departmentId = combo.departmentId;

    k.successfulCombos.push({
      ...combo,
      createdAt: new Date().toISOString(),
    });

    if (k.successfulCombos.length > 50) {
      k.successfulCombos = k.successfulCombos.slice(-50);
    }

    await this.save();
  }

  /**
   * Record a successful payment combination
   */
  async recordPaymentSuccess(combo: Omit<PaymentSuccessfulCombo, 'createdAt'>): Promise<void> {
    await this.load();
    const k = this.knowledge.payment;

    if (combo.bankAccountId) k.workingDefaults.bankAccountId = combo.bankAccountId;
    if (combo.paymentMethod) k.workingDefaults.paymentMethod = combo.paymentMethod;
    if (combo.currency) k.workingDefaults.currency = combo.currency;

    k.successfulCombos.push({
      ...combo,
      createdAt: new Date().toISOString(),
    });

    if (k.successfulCombos.length > 50) {
      k.successfulCombos = k.successfulCombos.slice(-50);
    }

    await this.save();
  }

  /**
   * Record a successful combination (backwards compatible - invoice only)
   */
  async recordSuccess(
    action: 'invoice',
    combo: Omit<SuccessfulCombo, 'createdAt'>
  ): Promise<void> {
    await this.recordInvoiceSuccess(combo);
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
