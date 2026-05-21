import { SageClient } from '../client.js';
import {
  queryArAdjustmentsTemplate,
  queryArAdjustmentByIdTemplate,
  readArAdjustmentTemplate,
  queryArAdjustmentsFilteredTemplate,
  createArAdjustmentTemplate,
  queryCreditMemosByCustomerTemplate,
  createCreditMemoTemplate,
} from '../templates/aradjustment.js';
import type {
  QueryArAdjustmentsData,
  QueryArAdjustmentByIdData,
  ReadArAdjustmentData,
  QueryArAdjustmentsFilteredData,
  CreateArAdjustmentData,
  ArAdjustmentLineItem,
  QueryCreditMemosByCustomerData,
  CreateCreditMemoData,
  CreditMemoLineItem,
} from '../templates/aradjustment.js';
import { extractData, ensureArray } from '../parser.js';
import type { SageResponse } from '../parser.js';

/**
 * AR Adjustment record
 */
export interface ArAdjustment {
  RECORDNO: string;
  RECORDID: string;
  RECORDTYPE?: string;  // 'ra' for credit memos
  CUSTOMERID: string;
  CUSTOMERNAME?: string;
  STATE?: string;
  RAWSTATE?: string;
  WHENCREATED?: string;
  WHENPOSTED?: string;
  WHENPAID?: string;
  WHENMODIFIED?: string;
  TOTALENTERED?: number;
  TOTALPAID?: number;
  TOTALDUE?: number;
  TOTALSELECTED?: number;
  TRX_TOTALENTERED?: number;
  TRX_TOTALPAID?: number;
  TRX_TOTALDUE?: number;
  TRX_TOTALSELECTED?: number;
  CURRENCY?: string;
  BASECURR?: string;
  DESCRIPTION?: string;
  DOCNUMBER?: string;
  BILLTOPAYTOCONTACTNAME?: string;
  SHIPTORETURNTOCONTACTNAME?: string;
  MEGAENTITYID?: string;
  MEGAENTITYNAME?: string;
  MEGAENTITYKEY?: string;
  PRBATCH?: string;
  PRBATCHKEY?: string;
  AUWHENCREATED?: string;
  CREATEDBY?: string;
  MODIFIEDBY?: string;
  CREATEDBYLOGINID?: string;
  MODIFIEDBYLOGINID?: string;
  SUPDOCID?: string;
}

export interface ArAdjustmentsResult {
  success: boolean;
  adjustments: ArAdjustment[];
  error?: string;
}

export interface ArAdjustmentResult {
  success: boolean;
  adjustment?: ArAdjustment;
  error?: string;
  rawResponse?: SageResponse;
}

export interface CreateArAdjustmentResult {
  success: boolean;
  recordNo?: string;
  recordId?: string;
  error?: string;
  rawResponse?: SageResponse;
}

/**
 * List AR adjustments with optional customer filter
 */
export async function listArAdjustments(
  client: SageClient,
  options: { customerId?: string; pageSize?: number } = {}
): Promise<ArAdjustmentsResult> {
  const data: QueryArAdjustmentsData = {
    customerId: options.customerId,
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryArAdjustmentsTemplate, data, 'listArAdjustments');

  if (!response.success) {
    return {
      success: false,
      adjustments: [],
      error: response.error?.description || 'Failed to list AR adjustments',
    };
  }

  const rawAdjustments = extractData<ArAdjustment>(response, 'ARADJUSTMENT');
  const adjustments = ensureArray(rawAdjustments);

  return {
    success: true,
    adjustments,
  };
}

/**
 * Get AR adjustment by RECORDNO (full details)
 */
export async function getArAdjustment(
  client: SageClient,
  recordNo: string
): Promise<ArAdjustmentResult> {
  const data: ReadArAdjustmentData = { recordNo };

  const response = await client.execute(readArAdjustmentTemplate, data, 'getArAdjustment');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get AR adjustment',
      rawResponse: response,
    };
  }

  const adjustment = extractData<ArAdjustment>(response, 'ARADJUSTMENT');

  if (!adjustment || (Array.isArray(adjustment) && adjustment.length === 0)) {
    return {
      success: false,
      error: `AR Adjustment ${recordNo} not found`,
      rawResponse: response,
    };
  }

  return {
    success: true,
    adjustment: Array.isArray(adjustment) ? adjustment[0] : adjustment,
    rawResponse: response,
  };
}

/**
 * Query AR adjustment by RECORDID (adjustment number)
 */
export async function queryArAdjustmentById(
  client: SageClient,
  recordId: string
): Promise<ArAdjustmentResult> {
  const data: QueryArAdjustmentByIdData = { recordId };

  const response = await client.execute(queryArAdjustmentByIdTemplate, data, 'queryArAdjustmentById');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to query AR adjustment',
      rawResponse: response,
    };
  }

  const rawAdjustments = extractData<ArAdjustment>(response, 'ARADJUSTMENT');
  const adjustments = ensureArray(rawAdjustments);

  if (adjustments.length === 0) {
    return {
      success: false,
      error: `AR Adjustment with ID ${recordId} not found`,
      rawResponse: response,
    };
  }

  return {
    success: true,
    adjustment: adjustments[0],
    rawResponse: response,
  };
}

/**
 * Query AR adjustments with multiple filters
 */
export async function queryArAdjustments(
  client: SageClient,
  filters: {
    customerId?: string;
    recordId?: string;
    recordNo?: string;
    state?: string;
    pageSize?: number;
  }
): Promise<ArAdjustmentsResult> {
  const filterCount = [filters.customerId, filters.recordId, filters.recordNo, filters.state]
    .filter(Boolean).length;

  const data: QueryArAdjustmentsFilteredData = {
    ...filters,
    hasMultipleFilters: filterCount > 1,
    pageSize: filters.pageSize || 50,
  };

  const response = await client.execute(queryArAdjustmentsFilteredTemplate, data, 'queryArAdjustments');

  if (!response.success) {
    return {
      success: false,
      adjustments: [],
      error: response.error?.description || 'Failed to query AR adjustments',
    };
  }

  const rawAdjustments = extractData<ArAdjustment>(response, 'ARADJUSTMENT');
  const adjustments = ensureArray(rawAdjustments);

  return {
    success: true,
    adjustments,
  };
}

/**
 * Create a new AR adjustment
 * @param client - Sage client instance
 * @param adjustmentData - Adjustment data including customer, amount, and optional invoice
 */
export async function createArAdjustment(
  client: SageClient,
  adjustmentData: {
    customerId: string;
    amount: number;
    invoiceNo?: string;
    glAccountNo?: string;
    accountLabel?: string;
    description?: string;
    memo?: string;
    whenCreated?: string;
    baseCurrency?: string;
    currency?: string;
    exchangeRate?: number;
    locationId?: string;
    departmentId?: string;
  }
): Promise<CreateArAdjustmentResult> {
  const today = new Date();
  const formatDate = (date: Date): string => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const lineItem: ArAdjustmentLineItem = {
    amount: adjustmentData.amount,
    memo: adjustmentData.memo,
    locationId: adjustmentData.locationId,
    departmentId: adjustmentData.departmentId,
  };

  if (adjustmentData.accountLabel) {
    lineItem.accountLabel = adjustmentData.accountLabel;
  } else if (adjustmentData.glAccountNo) {
    lineItem.glAccountNo = adjustmentData.glAccountNo;
  }

  const data: CreateArAdjustmentData = {
    customerId: adjustmentData.customerId,
    whenCreated: adjustmentData.whenCreated || formatDate(today),
    invoiceNo: adjustmentData.invoiceNo,
    description: adjustmentData.description,
    baseCurrency: adjustmentData.baseCurrency,
    currency: adjustmentData.currency,
    exchangeRate: adjustmentData.exchangeRate,
    lineItems: [lineItem],
  };

  const response = await client.execute(createArAdjustmentTemplate, data, 'createArAdjustment');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create AR adjustment',
      rawResponse: response,
    };
  }

  // For create operations, the record number is returned in response.key
  let recordNo: string | undefined = response.key;
  let recordId: string | undefined;

  // Also check in data if key wasn't found at top level
  if (!recordNo) {
    const responseData = response.data as Record<string, unknown>;
    const createdAdjustment = responseData?.ARADJUSTMENT || responseData?.aradjustment;
    if (createdAdjustment) {
      const adj = createdAdjustment as Record<string, unknown>;
      recordNo = String(adj.RECORDNO || adj.recordno || '');
      recordId = String(adj.RECORDID || adj.recordid || '');
    }
  }

  return {
    success: true,
    recordNo,
    recordId,
    rawResponse: response,
  };
}

/**
 * Create AR adjustment with multiple line items
 */
export async function createArAdjustmentWithLines(
  client: SageClient,
  adjustmentData: {
    customerId: string;
    lineItems: ArAdjustmentLineItem[];
    invoiceNo?: string;
    description?: string;
    whenCreated?: string;
    baseCurrency?: string;
    currency?: string;
    exchangeRate?: number;
  }
): Promise<CreateArAdjustmentResult> {
  const today = new Date();
  const formatDate = (date: Date): string => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const data: CreateArAdjustmentData = {
    customerId: adjustmentData.customerId,
    whenCreated: adjustmentData.whenCreated || formatDate(today),
    invoiceNo: adjustmentData.invoiceNo,
    description: adjustmentData.description,
    baseCurrency: adjustmentData.baseCurrency,
    currency: adjustmentData.currency,
    exchangeRate: adjustmentData.exchangeRate,
    lineItems: adjustmentData.lineItems,
  };

  const response = await client.execute(createArAdjustmentTemplate, data, 'createArAdjustmentWithLines');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create AR adjustment',
      rawResponse: response,
    };
  }

  // For create operations, the record number is returned in response.key
  let recordNo: string | undefined = response.key;
  let recordId: string | undefined;

  // Also check in data if key wasn't found at top level
  if (!recordNo) {
    const responseData = response.data as Record<string, unknown>;
    const createdAdjustment = responseData?.ARADJUSTMENT || responseData?.aradjustment;
    if (createdAdjustment) {
      const adj = createdAdjustment as Record<string, unknown>;
      recordNo = String(adj.RECORDNO || adj.recordno || '');
      recordId = String(adj.RECORDID || adj.recordid || '');
    }
  }

  return {
    success: true,
    recordNo,
    recordId,
    rawResponse: response,
  };
}

/**
 * List credit memos for a customer
 * Credit memos are AR adjustments with RECORDTYPE='ra' and negative amounts
 * @param client - Sage client instance
 * @param customerId - Customer ID to filter by
 * @param options - Optional filters: currency, state (Paid, Posted, Submitted), pageSize
 */
export async function listCreditMemos(
  client: SageClient,
  customerId: string,
  options: { currency?: string; state?: string; pageSize?: number } = {}
): Promise<ArAdjustmentsResult> {
  const data: QueryCreditMemosByCustomerData = {
    customerId,
    currency: options.currency,
    state: options.state,
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryCreditMemosByCustomerTemplate, data, 'listCreditMemos');

  if (!response.success) {
    return {
      success: false,
      adjustments: [],
      error: response.error?.description || 'Failed to list credit memos',
    };
  }

  const rawAdjustments = extractData<ArAdjustment>(response, 'ARADJUSTMENT');
  const adjustments = ensureArray(rawAdjustments);

  return {
    success: true,
    adjustments,
  };
}

/**
 * Create a credit memo (AR adjustment with negative amount)
 * @param client - Sage client instance
 * @param creditMemoData - Credit memo data including customer and credit amount (positive value, will be negated)
 */
export async function createCreditMemo(
  client: SageClient,
  creditMemoData: {
    customerId: string;
    amount: number;  // Positive value - will be negated to create credit
    glAccountNo?: string;
    accountLabel?: string;
    adjustmentNo?: string;
    description?: string;
    memo?: string;
    whenCreated?: string;  // MM/DD/YYYY format, defaults to today
    baseCurrency?: string;
    currency?: string;
    exchangeRate?: number;
    locationId?: string;
    departmentId?: string;
    classId?: string;
  }
): Promise<CreateArAdjustmentResult> {
  // Parse or create date
  const today = new Date();
  let year: string, month: string, day: string;

  if (creditMemoData.whenCreated) {
    // Parse MM/DD/YYYY format
    const parts = creditMemoData.whenCreated.split('/');
    if (parts.length === 3) {
      month = parts[0].padStart(2, '0');
      day = parts[1].padStart(2, '0');
      year = parts[2];
    } else {
      // Fallback to today
      year = today.getFullYear().toString();
      month = String(today.getMonth() + 1).padStart(2, '0');
      day = String(today.getDate()).padStart(2, '0');
    }
  } else {
    year = today.getFullYear().toString();
    month = String(today.getMonth() + 1).padStart(2, '0');
    day = String(today.getDate()).padStart(2, '0');
  }

  // Ensure amount is negative for credit memo
  const creditAmount = creditMemoData.amount > 0 ? -creditMemoData.amount : creditMemoData.amount;

  // Build line item - no customerid at line level to avoid validation issues
  const lineItem: CreditMemoLineItem = {
    amount: creditAmount,
    memo: creditMemoData.memo || 'Credit memo',
    locationId: creditMemoData.locationId,
    departmentId: creditMemoData.departmentId,
    classId: creditMemoData.classId,
  };

  if (creditMemoData.accountLabel) {
    lineItem.accountLabel = creditMemoData.accountLabel;
  } else if (creditMemoData.glAccountNo) {
    lineItem.glAccountNo = creditMemoData.glAccountNo;
  }

  // Currency defaults - required fields
  const baseCurrency = creditMemoData.baseCurrency || 'USD';
  const currency = creditMemoData.currency || baseCurrency;
  const exchangeRate = creditMemoData.exchangeRate ?? 1;  // Default to 1 for same currency

  const data: CreateCreditMemoData = {
    customerId: creditMemoData.customerId,
    year,
    month,
    day,
    adjustmentNo: creditMemoData.adjustmentNo,
    description: creditMemoData.description || 'Credit memo',
    baseCurrency,
    currency,
    exchangeRate,
    lineItems: [lineItem],
  };

  const response = await client.execute(createCreditMemoTemplate, data, 'createCreditMemo');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create credit memo',
      rawResponse: response,
    };
  }

  // For create_aradjustment, the record number is returned in response.key
  let recordNo: string | undefined = response.key;
  let recordId: string | undefined;

  // Also check in data if key wasn't found at top level
  if (!recordNo) {
    const responseData = response.data as Record<string, unknown>;
    const createdAdjustment = responseData?.ARADJUSTMENT || responseData?.aradjustment;
    if (createdAdjustment) {
      const adj = createdAdjustment as Record<string, unknown>;
      recordNo = String(adj.RECORDNO || adj.recordno || '');
      recordId = String(adj.RECORDID || adj.recordid || '');
    }
  }

  return {
    success: true,
    recordNo,
    recordId,
    rawResponse: response,
  };
}

/**
 * Create credit memo with multiple line items
 */
export async function createCreditMemoWithLines(
  client: SageClient,
  creditMemoData: {
    customerId: string;
    lineItems: CreditMemoLineItem[];
    adjustmentNo?: string;
    description?: string;
    whenCreated?: string;
    baseCurrency?: string;
    currency?: string;
    exchangeRate?: number;
  }
): Promise<CreateArAdjustmentResult> {
  const today = new Date();
  let year: string, month: string, day: string;

  if (creditMemoData.whenCreated) {
    const parts = creditMemoData.whenCreated.split('/');
    if (parts.length === 3) {
      month = parts[0].padStart(2, '0');
      day = parts[1].padStart(2, '0');
      year = parts[2];
    } else {
      year = today.getFullYear().toString();
      month = String(today.getMonth() + 1).padStart(2, '0');
      day = String(today.getDate()).padStart(2, '0');
    }
  } else {
    year = today.getFullYear().toString();
    month = String(today.getMonth() + 1).padStart(2, '0');
    day = String(today.getDate()).padStart(2, '0');
  }

  // Ensure all amounts are negative and remove line-level customerid
  const negatedLineItems = creditMemoData.lineItems.map(item => {
    const { ...lineItem } = item;
    return {
      ...lineItem,
      amount: item.amount > 0 ? -item.amount : item.amount,
    };
  });

  // Currency defaults - required fields
  const baseCurrency = creditMemoData.baseCurrency || 'USD';
  const currency = creditMemoData.currency || baseCurrency;
  const exchangeRate = creditMemoData.exchangeRate ?? 1;

  const data: CreateCreditMemoData = {
    customerId: creditMemoData.customerId,
    year,
    month,
    day,
    adjustmentNo: creditMemoData.adjustmentNo,
    description: creditMemoData.description || 'Credit memo',
    baseCurrency,
    currency,
    exchangeRate,
    lineItems: negatedLineItems,
  };

  const response = await client.execute(createCreditMemoTemplate, data, 'createCreditMemoWithLines');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create credit memo',
      rawResponse: response,
    };
  }

  // For create_aradjustment, the record number is returned in response.key
  let recordNo: string | undefined = response.key;
  let recordId: string | undefined;

  // Also check in data if key wasn't found at top level
  if (!recordNo) {
    const responseData = response.data as Record<string, unknown>;
    const createdAdjustment = responseData?.ARADJUSTMENT || responseData?.aradjustment;
    if (createdAdjustment) {
      const adj = createdAdjustment as Record<string, unknown>;
      recordNo = String(adj.RECORDNO || adj.recordno || '');
      recordId = String(adj.RECORDID || adj.recordid || '');
    }
  }

  return {
    success: true,
    recordNo,
    recordId,
    rawResponse: response,
  };
}

export type { ArAdjustmentLineItem, CreditMemoLineItem };
