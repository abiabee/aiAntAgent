/**
 * Bank Account Actions - Query bank/checking/savings accounts
 */

import { SageClient } from '../client.js';
import {
  queryCheckingAccountsTemplate,
  QueryCheckingAccountsData,
  querySavingsAccountsTemplate,
  QuerySavingsAccountsData,
  queryUndepositedFundsTemplate,
  QueryUndepositedFundsData,
} from '../templates/bankAccount.js';
import { extractData, ensureArray } from '../parser.js';

export interface BankAccount {
  BANKACCOUNTID: string;
  BANKACCOUNTNO?: string;
  BANKNAME?: string;
  DESCRIPTION?: string;
  CURRENCY?: string;
  STATUS?: string;
  GLACCOUNTNO?: string;
  GLACCOUNTTITLE?: string;
}

export interface UndepositedFundsAccount {
  ACCOUNTNO: string;
  TITLE?: string;
  ACCOUNTTYPE?: string;
  NORMALBALANCE?: string;
  STATUS?: string;
}

export interface ListBankAccountsResult {
  success: boolean;
  accounts: BankAccount[];
  error?: string;
}

export interface ListUndepositedFundsResult {
  success: boolean;
  accounts: UndepositedFundsAccount[];
  error?: string;
}

/**
 * List checking accounts (bank accounts for payments)
 */
export async function listCheckingAccounts(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListBankAccountsResult> {
  const data: QueryCheckingAccountsData = {
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryCheckingAccountsTemplate, data, 'listCheckingAccounts');

  if (!response.success) {
    return {
      success: false,
      accounts: [],
      error: response.error?.description || 'Failed to list checking accounts',
    };
  }

  const rawAccounts = extractData<BankAccount>(response, 'CHECKINGACCOUNT');
  const accounts = ensureArray(rawAccounts);

  return {
    success: true,
    accounts,
  };
}

/**
 * List savings accounts
 */
export async function listSavingsAccounts(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListBankAccountsResult> {
  const data: QuerySavingsAccountsData = {
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(querySavingsAccountsTemplate, data, 'listSavingsAccounts');

  if (!response.success) {
    return {
      success: false,
      accounts: [],
      error: response.error?.description || 'Failed to list savings accounts',
    };
  }

  const rawAccounts = extractData<BankAccount>(response, 'SAVINGSACCOUNT');
  const accounts = ensureArray(rawAccounts);

  return {
    success: true,
    accounts,
  };
}

/**
 * List all bank accounts (checking + savings)
 */
export async function listAllBankAccounts(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListBankAccountsResult> {
  const [checkingResult, savingsResult] = await Promise.all([
    listCheckingAccounts(client, options),
    listSavingsAccounts(client, options),
  ]);

  const accounts: BankAccount[] = [];
  
  if (checkingResult.success) {
    accounts.push(...checkingResult.accounts);
  }
  
  if (savingsResult.success) {
    accounts.push(...savingsResult.accounts);
  }

  if (accounts.length === 0 && !checkingResult.success && !savingsResult.success) {
    return {
      success: false,
      accounts: [],
      error: checkingResult.error || savingsResult.error || 'Failed to list bank accounts',
    };
  }

  return {
    success: true,
    accounts,
  };
}

/**
 * List undeposited funds accounts (GL accounts with "undeposited" in title)
 */
export async function listUndepositedFundsAccounts(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListUndepositedFundsResult> {
  const data: QueryUndepositedFundsData = {
    pageSize: options.pageSize || 20,
  };

  const response = await client.execute(queryUndepositedFundsTemplate, data, 'listUndepositedFunds');

  if (!response.success) {
    return {
      success: false,
      accounts: [],
      error: response.error?.description || 'Failed to list undeposited funds accounts',
    };
  }

  const rawAccounts = extractData<UndepositedFundsAccount>(response, 'GLACCOUNT');
  const accounts = ensureArray(rawAccounts);

  return {
    success: true,
    accounts,
  };
}
