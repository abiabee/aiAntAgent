/**
 * Learning Invoice Creator
 * Wraps invoice creation with automatic error recovery and learning
 */

import chalk from 'chalk';
import { SageClient } from './client.js';
import { createInvoice, CreateInvoiceResult } from './actions/invoice.js';
import { InvoiceLineItem } from './templates/invoice.js';
import { listCustomers, Customer } from './actions/listCustomers.js';
import { listGlAccounts, GlAccount } from './actions/listGlAccounts.js';
import { listDepartments, listLocations, Department, Location } from './actions/listDimensions.js';
import { classifySageError, SageErrorType, describeErrorType } from './errorClassifier.js';
import { KnowledgeStore, getKnowledgeStore } from './knowledge.js';
import { formatSageErrors } from './parser.js';

export interface InvoiceInput {
  customerId?: string;
  glAccountNo?: string;
  amount: number;
  currency?: string;
  description?: string;
  locationId?: string;
  departmentId?: string;
}

export interface LearningAttempt {
  attemptNumber: number;
  input: InvoiceInput;
  success: boolean;
  errorType?: SageErrorType;
  errorMessage?: string;
  recovery?: string;
}

export interface LearningResult {
  success: boolean;
  recordNo?: string;
  recordId?: string;
  attempts: LearningAttempt[];
  finalError?: string;
}

const MAX_ATTEMPTS = 5;

/**
 * Create invoice with automatic learning and recovery
 */
export async function createInvoiceWithLearning(
  client: SageClient,
  input: InvoiceInput,
  onAttempt?: (attempt: LearningAttempt) => void
): Promise<LearningResult> {
  const knowledge = getKnowledgeStore();
  const attempts: LearningAttempt[] = [];
  
  // Start with input values, falling back to learned working defaults
  const actionKnowledge = await knowledge.getActionKnowledge('invoice');
  let current: InvoiceInput = {
    customerId: input.customerId || actionKnowledge.workingDefaults.customerId,
    glAccountNo: input.glAccountNo || actionKnowledge.workingDefaults.glAccountNo,
    amount: input.amount,
    currency: input.currency || actionKnowledge.workingDefaults.currency || 'USD',
    description: input.description,
    locationId: input.locationId || actionKnowledge.workingDefaults.locationId,
    departmentId: input.departmentId || actionKnowledge.workingDefaults.departmentId,
  };

  for (let attemptNum = 1; attemptNum <= MAX_ATTEMPTS; attemptNum++) {
    const attempt: LearningAttempt = {
      attemptNumber: attemptNum,
      input: { ...current },
      success: false,
    };

    // Validate we have required fields
    if (!current.customerId) {
      attempt.errorType = 'INVALID_CUSTOMER';
      attempt.errorMessage = 'No customer ID specified';
      attempt.recovery = 'Fetching active customers...';
      
      const recovered = await recoverMissingCustomer(client, knowledge, current);
      if (recovered) {
        current = recovered;
        attempts.push(attempt);
        onAttempt?.(attempt);
        continue;
      } else {
        attempt.recovery = 'No valid customers found';
        attempts.push(attempt);
        onAttempt?.(attempt);
        return { success: false, attempts, finalError: 'Could not find a valid customer' };
      }
    }

    if (!current.glAccountNo) {
      attempt.errorType = 'INVALID_GL_ACCOUNT';
      attempt.errorMessage = 'No GL account specified';
      attempt.recovery = 'Fetching GL accounts...';
      
      const recovered = await recoverMissingGlAccount(client, knowledge, current);
      if (recovered) {
        current = recovered;
        attempts.push(attempt);
        onAttempt?.(attempt);
        continue;
      } else {
        attempt.recovery = 'No valid GL accounts found';
        attempts.push(attempt);
        onAttempt?.(attempt);
        return { success: false, attempts, finalError: 'Could not find a valid GL account' };
      }
    }

    // Build line items
    const lineItems: InvoiceLineItem[] = [{
      glAccountNo: current.glAccountNo,
      amount: current.amount,
      memo: 'Invoice created by Sage Agent',
      locationId: current.locationId,
      departmentId: current.departmentId,
    }];

    // Try to create the invoice
    const result = await createInvoice(client, {
      customerId: current.customerId!,
      baseCurrency: current.currency,
      currency: current.currency,
      description: current.description || `Invoice created by Sage Agent`,
      lineItems,
    });

    if (result.success) {
      attempt.success = true;
      attempts.push(attempt);
      onAttempt?.(attempt);

      // Record successful combination
      await knowledge.recordSuccess('invoice', {
        customerId: current.customerId!,
        glAccountNo: current.glAccountNo,
        currency: current.currency,
        locationId: current.locationId,
        departmentId: current.departmentId,
      });

      return {
        success: true,
        recordNo: result.recordNo,
        recordId: result.recordId,
        attempts,
      };
    }

    // Classify the error
    const errorMessage = result.rawResponse?.error
      ? formatSageErrors(result.rawResponse.error)
      : result.error || 'Unknown error';
    
    const classified = classifySageError(errorMessage);
    
    attempt.errorType = classified.type;
    attempt.errorMessage = errorMessage;

    // Try to recover based on error type
    if (classified.recoverable) {
      const recovered = await recoverFromError(client, knowledge, current, classified);
      
      if (recovered.patched) {
        attempt.recovery = recovered.description;
        current = recovered.input;
        attempts.push(attempt);
        onAttempt?.(attempt);
        continue;
      } else {
        attempt.recovery = `Could not recover: ${recovered.description}`;
      }
    } else {
      attempt.recovery = `Non-recoverable error: ${describeErrorType(classified.type)}`;
    }

    attempts.push(attempt);
    onAttempt?.(attempt);

    // If we couldn't recover, stop trying
    if (!classified.recoverable) {
      return { success: false, attempts, finalError: errorMessage };
    }
  }

  return {
    success: false,
    attempts,
    finalError: `Could not create invoice after ${MAX_ATTEMPTS} recovery attempts`,
  };
}

/**
 * Recovery strategies for different error types
 */
async function recoverFromError(
  client: SageClient,
  knowledge: KnowledgeStore,
  current: InvoiceInput,
  classified: ReturnType<typeof classifySageError>
): Promise<{ patched: boolean; input: InvoiceInput; description: string }> {
  
  switch (classified.type) {
    case 'INVALID_CUSTOMER': {
      // Mark current customer as bad
      if (current.customerId) {
        await knowledge.markBadValue('invoice', 'customerId', current.customerId);
      }
      
      const recovered = await recoverMissingCustomer(client, knowledge, current);
      if (recovered) {
        return {
          patched: true,
          input: recovered,
          description: `Marked ${current.customerId} as invalid. Selected new customer: ${recovered.customerId}`,
        };
      }
      return { patched: false, input: current, description: 'No valid customers found' };
    }

    case 'MISSING_CURRENCY':
    case 'MISSING_BASE_CURRENCY': {
      return {
        patched: true,
        input: { ...current, currency: 'USD' },
        description: 'Added currency: USD',
      };
    }

    case 'BANK_ACCOUNT_USED_AS_GL':
    case 'INVALID_GL_ACCOUNT': {
      // Mark current GL account as bad
      if (current.glAccountNo) {
        await knowledge.markBadValue('invoice', 'glAccountNo', current.glAccountNo);
      }
      
      const recovered = await recoverMissingGlAccount(client, knowledge, current);
      if (recovered) {
        return {
          patched: true,
          input: recovered,
          description: `Marked GL ${current.glAccountNo} as invalid (${classified.type === 'BANK_ACCOUNT_USED_AS_GL' ? 'bank account' : 'not found'}). Selected new GL: ${recovered.glAccountNo}`,
        };
      }
      return { patched: false, input: current, description: 'No valid GL accounts found' };
    }

    case 'GL_REQUIRES_DEPARTMENT': {
      // Try to find and use a department
      const deptResult = await listDepartments(client, { pageSize: 20 });
      if (deptResult.success && deptResult.departments.length > 0) {
        const dept = deptResult.departments[0];
        return {
          patched: true,
          input: { ...current, departmentId: dept.DEPARTMENTID },
          description: `GL ${current.glAccountNo} requires Department. Using: ${dept.DEPARTMENTID} (${dept.TITLE || 'N/A'})`,
        };
      }
      
      // If no departments found, mark GL as bad and try another
      if (current.glAccountNo) {
        await knowledge.markBadValue('invoice', 'glAccountNo', current.glAccountNo);
      }
      const recovered = await recoverMissingGlAccount(client, knowledge, current);
      if (recovered) {
        return {
          patched: true,
          input: recovered,
          description: `No departments available. Trying different GL: ${recovered.glAccountNo}`,
        };
      }
      return { patched: false, input: current, description: 'No departments found and no alternative GL accounts' };
    }

    case 'GL_REQUIRES_LOCATION': {
      // Try to find and use a location
      const locResult = await listLocations(client, { pageSize: 20 });
      if (locResult.success && locResult.locations.length > 0) {
        const loc = locResult.locations[0];
        return {
          patched: true,
          input: { ...current, locationId: loc.LOCATIONID },
          description: `GL ${current.glAccountNo} requires Location. Using: ${loc.LOCATIONID} (${loc.NAME || 'N/A'})`,
        };
      }
      
      // If no locations found, mark GL as bad and try another
      if (current.glAccountNo) {
        await knowledge.markBadValue('invoice', 'glAccountNo', current.glAccountNo);
      }
      const recovered = await recoverMissingGlAccount(client, knowledge, current);
      if (recovered) {
        return {
          patched: true,
          input: recovered,
          description: `No locations available. Trying different GL: ${recovered.glAccountNo}`,
        };
      }
      return { patched: false, input: current, description: 'No locations found and no alternative GL accounts' };
    }

    case 'INVALID_LOCATION': {
      if (current.locationId) {
        await knowledge.markBadValue('invoice', 'locationId', current.locationId);
      }
      // Try without location
      return {
        patched: true,
        input: { ...current, locationId: undefined },
        description: `Removed invalid location ${current.locationId}`,
      };
    }

    case 'INVALID_DEPARTMENT': {
      if (current.departmentId) {
        await knowledge.markBadValue('invoice', 'departmentId', current.departmentId);
      }
      // Try without department
      return {
        patched: true,
        input: { ...current, departmentId: undefined },
        description: `Removed invalid department ${current.departmentId}`,
      };
    }

    default:
      return { patched: false, input: current, description: 'Unknown error type' };
  }
}

/**
 * Find a valid customer
 */
async function recoverMissingCustomer(
  client: SageClient,
  knowledge: KnowledgeStore,
  current: InvoiceInput
): Promise<InvoiceInput | null> {
  const result = await listCustomers(client, { pageSize: 50 });
  
  if (!result.success || result.customers.length === 0) {
    return null;
  }

  const actionKnowledge = await knowledge.getActionKnowledge('invoice');
  const badCustomers = actionKnowledge.badValues.customerIds;

  // Find first active customer not in bad list
  const candidate = result.customers.find(
    (c: Customer) => c.STATUS === 'active' && !badCustomers.includes(c.CUSTOMERID)
  );

  if (!candidate) {
    return null;
  }

  return { ...current, customerId: candidate.CUSTOMERID };
}

/**
 * Find a valid GL account (non-bank, revenue account)
 */
async function recoverMissingGlAccount(
  client: SageClient,
  knowledge: KnowledgeStore,
  current: InvoiceInput
): Promise<InvoiceInput | null> {
  const result = await listGlAccounts(client, { pageSize: 100 });
  
  if (!result.success || result.accounts.length === 0) {
    return null;
  }

  const actionKnowledge = await knowledge.getActionKnowledge('invoice');
  const badAccounts = actionKnowledge.badValues.glAccountNos;

  // Find a suitable account:
  // - Active status
  // - Not in bad list
  // - Prefer revenue accounts (credit normal balance) or income statement accounts
  const candidate = result.accounts.find((a: GlAccount) => {
    if (a.STATUS !== 'active') return false;
    if (badAccounts.includes(a.ACCOUNTNO)) return false;
    
    // Prefer income statement accounts (revenue/expense) over balance sheet
    if (a.ACCOUNTTYPE === 'incomestatement') return true;
    
    // Also accept accounts with credit normal balance (typically revenue)
    if (a.NORMALBALANCE === 'credit') return true;
    
    return false;
  });

  // If no revenue account found, try any active account not in bad list
  const fallback = candidate || result.accounts.find(
    (a: GlAccount) => a.STATUS === 'active' && !badAccounts.includes(a.ACCOUNTNO)
  );

  if (!fallback) {
    return null;
  }

  return { ...current, glAccountNo: fallback.ACCOUNTNO };
}
