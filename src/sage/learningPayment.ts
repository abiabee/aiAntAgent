/**
 * Learning Payment Creator
 * Wraps payment creation with automatic error recovery and learning
 */

import { SageClient } from './client.js';
import { createPayment, formatDateForSage, getPayment } from './actions/payment.js';
import type { CreatePaymentResult, PaymentInvoice } from './actions/payment.js';
import { getInvoice } from './actions/invoice.js';
import { listAllBankAccounts } from './actions/bankAccount.js';
import type { BankAccount } from './actions/bankAccount.js';
import { classifySageError, describeErrorType } from './errorClassifier.js';
import type { SageErrorType } from './errorClassifier.js';
import { getKnowledgeStore } from './knowledge.js';
import type { KnowledgeStore, PaymentKnowledge } from './knowledge.js';
import { formatSageErrors } from './parser.js';

export interface PaymentInput {
  invoiceRecordNo: string;
  amount?: number;  // If not provided, pays full amount due
  paymentMethod?: string;
  bankAccountId?: string;
  currency?: string;
  docNumber?: string;
}

export interface PaymentLearningAttempt {
  attemptNumber: number;
  input: {
    invoiceRecordNo: string;
    customerId?: string;
    amount?: number;
    paymentMethod?: string;
    bankAccountId?: string;
  };
  success: boolean;
  errorType?: SageErrorType;
  errorMessage?: string;
  recovery?: string;
}

export interface PaymentLearningResult {
  success: boolean;
  recordNo?: string;
  paymentId?: string;
  invoiceId?: string;
  amountPaid?: number;
  attempts: PaymentLearningAttempt[];
  finalError?: string;
}

const MAX_ATTEMPTS = 5;

const PAYMENT_METHODS = ['Cash', 'Check', 'EFT', 'ACH', 'Credit Card'];

/**
 * Create payment with automatic learning and recovery
 */
export async function createPaymentWithLearning(
  client: SageClient,
  input: PaymentInput,
  onAttempt?: (attempt: PaymentLearningAttempt) => void
): Promise<PaymentLearningResult> {
  const knowledge = getKnowledgeStore();
  const attempts: PaymentLearningAttempt[] = [];
  
  // Get learned payment knowledge
  const paymentKnowledge = await knowledge.getPaymentKnowledge();
  
  // First, fetch the invoice to get customer ID and amount due
  const invoiceResult = await getInvoice(client, input.invoiceRecordNo);
  
  if (!invoiceResult.success || !invoiceResult.invoice) {
    return {
      success: false,
      attempts: [],
      finalError: `Invoice ${input.invoiceRecordNo} not found: ${invoiceResult.error}`,
    };
  }

  const invoice = invoiceResult.invoice;
  const customerId = invoice.CUSTOMERID;
  const invoiceId = invoice.RECORDID;
  const amountDue = Number(invoice.TRX_TOTALDUE || invoice.TOTALDUE || 0);
  const currency = invoice.CURRENCY || 'USD';

  if (amountDue <= 0) {
    return {
      success: false,
      attempts: [],
      finalError: `Invoice ${invoiceId || input.invoiceRecordNo} has no balance due (Amount due: ${amountDue})`,
    };
  }

  // Determine payment amount
  const paymentAmount = input.amount !== undefined 
    ? Math.min(input.amount, amountDue)  // Don't overpay
    : amountDue;

  // Start with input values, falling back to learned defaults
  let currentBankAccountId = input.bankAccountId || paymentKnowledge.workingDefaults.bankAccountId;
  let currentPaymentMethod = input.paymentMethod || paymentKnowledge.workingDefaults.paymentMethod || 'Cash';

  // Track tried values
  const triedBankAccounts = new Set<string>();
  const triedPaymentMethods = new Set<string>();

  for (let attemptNum = 1; attemptNum <= MAX_ATTEMPTS; attemptNum++) {
    const attempt: PaymentLearningAttempt = {
      attemptNumber: attemptNum,
      input: {
        invoiceRecordNo: input.invoiceRecordNo,
        customerId,
        amount: paymentAmount,
        paymentMethod: currentPaymentMethod,
        bankAccountId: currentBankAccountId,
      },
      success: false,
    };

    // If no bank account, try to find one
    if (!currentBankAccountId) {
      attempt.errorType = 'INVALID_PAYMENT_ACCOUNT';
      attempt.errorMessage = 'No bank account specified';
      attempt.recovery = 'Fetching available bank accounts...';
      
      const recovered = await recoverMissingBankAccount(
        client, 
        knowledge, 
        triedBankAccounts,
        paymentKnowledge.badValues.bankAccountIds
      );
      
      if (recovered) {
        currentBankAccountId = recovered;
        triedBankAccounts.add(recovered);
        attempts.push(attempt);
        onAttempt?.(attempt);
        continue;
      } else {
        attempt.recovery = 'No valid bank accounts found';
        attempts.push(attempt);
        onAttempt?.(attempt);
        return { success: false, attempts, finalError: 'Could not find a valid bank account' };
      }
    }

    // Build the payment data
    const invoices: PaymentInvoice[] = [{
      recordNo: input.invoiceRecordNo,
      paymentAmount: paymentAmount,
    }];

    const result = await createPayment(client, {
      customerId: customerId!,
      paymentMethod: currentPaymentMethod,
      receiptDate: formatDateForSage(),
      checkingAccountId: currentBankAccountId,
      baseCurrency: currency,  // Required field
      currency: currency,
      invoices,
      docNumber: input.docNumber,
    });

    if (result.success) {
      attempt.success = true;
      attempts.push(attempt);
      onAttempt?.(attempt);

      // Record successful combination
      await knowledge.recordPaymentSuccess({
        customerId: customerId!,
        bankAccountId: currentBankAccountId,
        paymentMethod: currentPaymentMethod,
        currency: currency,
      });

      let paymentId = result.paymentId;
      if (result.recordNo && !paymentId) {
        const paymentDetails = await getPayment(client, result.recordNo);
        paymentId = paymentDetails.payment?.DOCNUMBER;
      }

      return {
        success: true,
        recordNo: result.recordNo,
        paymentId,
        invoiceId,
        amountPaid: paymentAmount,
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
      const recovered = await recoverFromPaymentError(
        client,
        knowledge,
        classified,
        currentBankAccountId,
        currentPaymentMethod,
        triedBankAccounts,
        triedPaymentMethods,
        paymentKnowledge
      );
      
      if (recovered.changed) {
        attempt.recovery = recovered.description;
        currentBankAccountId = recovered.bankAccountId;
        currentPaymentMethod = recovered.paymentMethod;
        
        if (recovered.bankAccountId) triedBankAccounts.add(recovered.bankAccountId);
        if (recovered.paymentMethod) triedPaymentMethods.add(recovered.paymentMethod);
        
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
    finalError: `Could not create payment after ${MAX_ATTEMPTS} recovery attempts`,
  };
}

/**
 * Find a valid bank account
 */
async function recoverMissingBankAccount(
  client: SageClient,
  knowledge: KnowledgeStore,
  triedAccounts: Set<string>,
  badAccounts: string[]
): Promise<string | null> {
  const result = await listAllBankAccounts(client, { pageSize: 30 });
  
  if (!result.success || result.accounts.length === 0) {
    return null;
  }

  // Find first active account not in bad list and not already tried
  const candidate = result.accounts.find(
    (a: BankAccount) => 
      a.STATUS === 'active' && 
      !badAccounts.includes(a.BANKACCOUNTID) &&
      !triedAccounts.has(a.BANKACCOUNTID)
  );

  return candidate?.BANKACCOUNTID || null;
}

/**
 * Recovery strategies for payment errors
 */
async function recoverFromPaymentError(
  client: SageClient,
  knowledge: KnowledgeStore,
  classified: ReturnType<typeof classifySageError>,
  currentBankAccountId: string | undefined,
  currentPaymentMethod: string,
  triedBankAccounts: Set<string>,
  triedPaymentMethods: Set<string>,
  paymentKnowledge: PaymentKnowledge
): Promise<{
  changed: boolean;
  bankAccountId?: string;
  paymentMethod: string;
  description: string;
}> {
  
  switch (classified.type) {
    case 'INVALID_PAYMENT_ACCOUNT':
    case 'INVALID_BANK_ACCOUNT':
    case 'INVALID_FINANCIAL_ENTITY': {
      // Mark current bank account as bad
      if (currentBankAccountId) {
        await knowledge.markPaymentBadValue('bankAccountId', currentBankAccountId);
        triedBankAccounts.add(currentBankAccountId);
      }
      
      // Try to find another bank account
      const newAccount = await recoverMissingBankAccount(
        client,
        knowledge,
        triedBankAccounts,
        paymentKnowledge.badValues.bankAccountIds
      );
      
      if (newAccount) {
        return {
          changed: true,
          bankAccountId: newAccount,
          paymentMethod: currentPaymentMethod,
          description: `Marked ${currentBankAccountId} as invalid. Trying bank account: ${newAccount}`,
        };
      }
      return { 
        changed: false, 
        paymentMethod: currentPaymentMethod,
        description: 'No valid bank accounts found' 
      };
    }

    case 'INVALID_PAYMENT_METHOD': {
      // Mark current payment method as bad
      await knowledge.markPaymentBadValue('paymentMethod', currentPaymentMethod);
      triedPaymentMethods.add(currentPaymentMethod);
      
      // Try next payment method
      const nextMethod = PAYMENT_METHODS.find(
        m => !triedPaymentMethods.has(m) && !paymentKnowledge.badValues.paymentMethods.includes(m)
      );
      
      if (nextMethod) {
        return {
          changed: true,
          bankAccountId: currentBankAccountId,
          paymentMethod: nextMethod,
          description: `Marked ${currentPaymentMethod} as invalid. Trying: ${nextMethod}`,
        };
      }
      return { 
        changed: false, 
        paymentMethod: currentPaymentMethod,
        description: 'No valid payment methods found' 
      };
    }

    case 'PAYMENT_AMOUNT_EXCEEDS_DUE': {
      // This shouldn't happen since we cap the amount, but handle it anyway
      return {
        changed: false,
        paymentMethod: currentPaymentMethod,
        description: 'Payment amount exceeds amount due - cannot auto-recover',
      };
    }

    default:
      return { 
        changed: false, 
        paymentMethod: currentPaymentMethod,
        description: 'Unknown error type' 
      };
  }
}
