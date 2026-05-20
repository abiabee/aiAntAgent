import { SageClient } from '../client.js';
import {
  queryArAdjustmentsTemplate,
  queryArAdjustmentByIdTemplate,
  readArAdjustmentTemplate,
  queryArAdjustmentsFilteredTemplate,
} from '../templates/aradjustment.js';
import type {
  QueryArAdjustmentsData,
  QueryArAdjustmentByIdData,
  ReadArAdjustmentData,
  QueryArAdjustmentsFilteredData,
} from '../templates/aradjustment.js';
import { extractData, ensureArray } from '../parser.js';
import type { SageResponse } from '../parser.js';

/**
 * AR Adjustment record
 */
export interface ArAdjustment {
  RECORDNO: string;
  RECORDID: string;
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
