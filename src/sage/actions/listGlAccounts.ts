import { SageClient } from '../client.js';
import { 
  queryGlAccountsTemplate, 
  QueryGlAccountsData,
  queryRevenueAccountsTemplate,
  QueryRevenueAccountsData,
  queryAccountLabelsTemplate,
  QueryAccountLabelsData,
  readGlAccountTemplate,
  ReadGlAccountData
} from '../templates/glaccount.js';
import { extractData, ensureArray } from '../parser.js';

export interface GlAccount {
  RECORDNO: string;
  ACCOUNTNO: string;
  TITLE: string;
  ACCOUNTTYPE?: string;
  NORMALBALANCE?: string;
  STATUS?: string;
  CATEGORY?: string;
}

export interface AccountLabel {
  RECORDNO: string;
  ACCOUNTLABEL: string;
  DESCRIPTION?: string;
  GLACCOUNTNO?: string;
  STATUS?: string;
}

export interface ListGlAccountsResult {
  success: boolean;
  accounts: GlAccount[];
  error?: string;
}

/**
 * List GL accounts from Sage Intacct
 */
export async function listGlAccounts(
  client: SageClient,
  options: { accountType?: string; pageSize?: number; offset?: number } = {}
): Promise<ListGlAccountsResult> {
  const data: QueryGlAccountsData = {
    accountType: options.accountType,
    pageSize: options.pageSize || 100,
    offset: options.offset,
  };

  const response = await client.execute(queryGlAccountsTemplate, data, 'listGlAccounts');

  if (!response.success) {
    return {
      success: false,
      accounts: [],
      error: response.error?.description || 'Failed to list GL accounts',
    };
  }

  const rawAccounts = extractData<GlAccount>(response, 'GLACCOUNT');
  const accounts = ensureArray(rawAccounts);

  return {
    success: true,
    accounts,
  };
}

/**
 * List revenue accounts (typically used for AR invoices)
 */
export async function listRevenueAccounts(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListGlAccountsResult> {
  const data: QueryRevenueAccountsData = {
    pageSize: options.pageSize || 100,
  };

  const response = await client.execute(queryRevenueAccountsTemplate, data, 'listRevenueAccounts');

  if (!response.success) {
    return {
      success: false,
      accounts: [],
      error: response.error?.description || 'Failed to list revenue accounts',
    };
  }

  const rawAccounts = extractData<GlAccount>(response, 'GLACCOUNT');
  const accounts = ensureArray(rawAccounts);

  return {
    success: true,
    accounts,
  };
}

/**
 * List account labels
 */
export async function listAccountLabels(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<{ success: boolean; labels: AccountLabel[]; error?: string }> {
  const data: QueryAccountLabelsData = {
    pageSize: options.pageSize || 100,
  };

  const response = await client.execute(queryAccountLabelsTemplate, data, 'listAccountLabels');

  if (!response.success) {
    return {
      success: false,
      labels: [],
      error: response.error?.description || 'Failed to list account labels',
    };
  }

  const rawLabels = extractData<AccountLabel>(response, 'ACCOUNTLABEL');
  const labels = ensureArray(rawLabels);

  return {
    success: true,
    labels,
  };
}

/**
 * Get a single GL account by account number
 */
export async function getGlAccount(
  client: SageClient,
  accountNo: string
): Promise<{ success: boolean; account?: GlAccount; error?: string }> {
  const data: ReadGlAccountData = { accountNo };

  const response = await client.execute(readGlAccountTemplate, data, 'getGlAccount');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get GL account',
    };
  }

  const account = extractData<GlAccount>(response, 'GLACCOUNT');
  
  if (!account || (Array.isArray(account) && account.length === 0)) {
    return {
      success: false,
      error: `GL Account ${accountNo} not found`,
    };
  }

  return {
    success: true,
    account: Array.isArray(account) ? account[0] : account,
  };
}
