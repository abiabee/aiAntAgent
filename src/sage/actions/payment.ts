/**
 * Payment Actions - AR Payment operations
 */

import { SageClient } from '../client.js';
import {
  createArPaymentTemplate,
  queryArPaymentsTemplate,
  readArPaymentTemplate,
} from '../templates/payment.js';
import type {
  CreateArPaymentData,
  QueryArPaymentsData,
  ReadArPaymentData,
  PaymentInvoice,
} from '../templates/payment.js';
import { extractData, ensureArray } from '../parser.js';

export interface Payment {
  RECORDNO?: string;
  DOCNUMBER?: string;
  CUSTOMERID?: string;
  CUSTOMERNAME?: string;
  PAYMENTMETHOD?: string;
  RECEIPTDATE?: string;
  PAYMENTDATE?: string;
  TRX_TOTALPAID?: string;
  TRX_TOTALSELECTED?: string;
  STATE?: string;
  CURRENCY?: string;
  BASECURR?: string;
  FINANCIALENTITY?: string;
  BANKACCOUNTID?: string;
  UNDEPOSITEDACCOUNTNO?: string;
  WHENCREATED?: string;
  WHENMODIFIED?: string;
  AUWHENCREATED?: string;
  CREATEDBY?: string;
  MODIFIEDBY?: string;
}

export interface PaymentDetail {
  RECORDNO?: string;
  RECORDKEY?: string;
  ENTRYKEY?: string;
  POSADJKEY?: string;
  TRX_PAYMENTAMOUNT?: string;
  INLINEKEY?: string;
  INLINEENTRYKEY?: string;
  ENTRYDESCRIPTION?: string;
}

export interface PaymentFull extends Payment {
  ARPYMTDETAILS?: {
    arpymtdetail?: PaymentDetail | PaymentDetail[];
  };
}

export interface CreatePaymentResult {
  success: boolean;
  recordNo?: string;
  error?: string;
  rawResponse?: { error?: unknown };
}

export interface ListPaymentsResult {
  success: boolean;
  payments: Payment[];
  error?: string;
}

export interface GetPaymentResult {
  success: boolean;
  payment?: PaymentFull;
  error?: string;
}

/**
 * Create an AR payment
 */
export async function createPayment(
  client: SageClient,
  data: CreateArPaymentData
): Promise<CreatePaymentResult> {
  const response = await client.execute(createArPaymentTemplate, data, 'createPayment');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create payment',
      rawResponse: { error: response.error },
    };
  }

  const payment = extractData<{ RECORDNO?: string }>(response, 'ARPYMT');
  const recordNo = Array.isArray(payment) ? payment[0]?.RECORDNO : payment?.RECORDNO;

  return {
    success: true,
    recordNo,
  };
}

/**
 * List AR payments
 */
export async function listPayments(
  client: SageClient,
  options: { customerId?: string; pageSize?: number } = {}
): Promise<ListPaymentsResult> {
  const data: QueryArPaymentsData = {
    customerId: options.customerId,
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryArPaymentsTemplate, data, 'listPayments');

  if (!response.success) {
    return {
      success: false,
      payments: [],
      error: response.error?.description || 'Failed to list payments',
    };
  }

  const rawPayments = extractData<Payment>(response, 'ARPYMT');
  const payments = ensureArray(rawPayments);

  return {
    success: true,
    payments,
  };
}

/**
 * Get a single payment by record number
 */
export async function getPayment(
  client: SageClient,
  recordNo: string
): Promise<GetPaymentResult> {
  const data: ReadArPaymentData = { recordNo };

  const response = await client.execute(readArPaymentTemplate, data, 'getPayment');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get payment',
    };
  }

  const payment = extractData<PaymentFull>(response, 'ARPYMT');

  if (!payment || (Array.isArray(payment) && payment.length === 0)) {
    return {
      success: false,
      error: `Payment ${recordNo} not found`,
    };
  }

  return {
    success: true,
    payment: Array.isArray(payment) ? payment[0] : payment,
  };
}

/**
 * Format today's date as MM/DD/YYYY for Sage
 */
export function formatDateForSage(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

export type { PaymentInvoice };
