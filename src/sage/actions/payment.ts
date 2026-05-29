/**
 * Payment Actions - AR Payment operations
 */

import { SageClient } from '../client.js';
import {
  createArPaymentTemplate,
  queryArPaymentsTemplate,
  queryArPaymentByDocNoTemplate,
  readArPaymentTemplate,
} from '../templates/payment.js';
import type {
  CreateArPaymentData,
  QueryArPaymentsData,
  QueryArPaymentByDocNoData,
  ReadArPaymentData,
  PaymentInvoice,
} from '../templates/payment.js';
import { extractData, ensureArray } from '../parser.js';
import {
  buildPaymentApplications,
  extractPaymentDetails,
  summarizePaymentAmounts,
  type PaymentAmountSummary,
  type PaymentApplication,
  type PaymentDetailRow,
  type PaymentEntryRow,
} from '../paymentUtils.js';
import {
  queryInvoicesByRecordNosTemplate,
  type QueryInvoicesByRecordNosData,
} from '../templates/invoice.js';

export interface Payment {
  RECORDNO?: string;
  DOCNUMBER?: string;
  CUSTOMERID?: string;
  CUSTOMERNAME?: string;
  PAYMENTMETHOD?: string;
  RECEIPTDATE?: string;
  PAYMENTDATE?: string;
  WHENPAID?: string;
  TRX_TOTALPAID?: string;
  TRX_TOTALSELECTED?: string;
  TOTALPAID?: string;
  TOTALSELECTED?: string;
  STATE?: string;
  CURRENCY?: string;
  BASECURR?: string;
  FINANCIALENTITY?: string;
  BANKACCOUNTID?: string;
  UNDEPOSITEDACCOUNTNO?: string;
  LOCATIONID?: string;
  WHENCREATED?: string;
  WHENMODIFIED?: string;
  AUWHENCREATED?: string;
  CREATEDBY?: string;
  MODIFIEDBY?: string;
}

export interface PaymentDetail extends PaymentDetailRow {}

export interface PaymentEntry extends PaymentEntryRow {}

export interface PaymentFull extends Payment {
  ARPYMTDETAILS?: {
    ARPYMTDETAIL?: PaymentDetail | PaymentDetail[];
    arpymtdetail?: PaymentDetail | PaymentDetail[];
  };
  ARPYMTENTRIES?: {
    ARPYMTENTRY?: PaymentEntry | PaymentEntry[];
    arpymtentry?: PaymentEntry | PaymentEntry[];
  };
}

export interface CreatePaymentResult {
  success: boolean;
  recordNo?: string;
  paymentId?: string;
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
  applications?: PaymentApplication[];
  amountSummary?: PaymentAmountSummary;
  error?: string;
}

async function lookupInvoiceIdsByRecordNo(
  client: SageClient,
  recordNos: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(recordNos.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }

  const data: QueryInvoicesByRecordNosData = { recordNos: unique };
  const response = await client.execute(
    queryInvoicesByRecordNosTemplate,
    data,
    'lookupInvoicesByRecordNo'
  );

  if (!response.success) {
    return new Map();
  }

  const rawInvoices = extractData<{ RECORDNO?: string; RECORDID?: string }>(response, 'ARINVOICE');
  const invoices = ensureArray(rawInvoices);
  const map = new Map<string, string>();

  for (const invoice of invoices) {
    if (invoice.RECORDNO && invoice.RECORDID) {
      map.set(String(invoice.RECORDNO), String(invoice.RECORDID));
    }
  }

  return map;
}

async function enrichPaymentResult(
  client: SageClient,
  paymentRecord: PaymentFull
): Promise<GetPaymentResult> {
  const details = extractPaymentDetails(paymentRecord as unknown as Record<string, unknown>);
  const recordNos = details.map((d) => String(d.RECORDKEY || d.RECORDNO || '')).filter(Boolean);
  const invoiceIdByRecordNo = await lookupInvoiceIdsByRecordNo(client, recordNos);
  const applications = buildPaymentApplications(details, invoiceIdByRecordNo);
  const amountSummary = summarizePaymentAmounts(
    paymentRecord as unknown as Record<string, unknown>,
    applications
  );

  return {
    success: true,
    payment: paymentRecord,
    applications,
    amountSummary,
  };
}

async function readPaymentByRecordNo(
  client: SageClient,
  recordNo: string
): Promise<PaymentFull | null> {
  const data: ReadArPaymentData = { recordNo };
  const response = await client.execute(readArPaymentTemplate, data, 'getPayment');

  if (!response.success) {
    return null;
  }

  const payment = extractData<PaymentFull>(response, 'ARPYMT');
  if (!payment || (Array.isArray(payment) && payment.length === 0)) {
    return null;
  }

  return Array.isArray(payment) ? payment[0] : payment;
}

async function lookupPaymentRecordNoByDocNo(
  client: SageClient,
  docNumber: string
): Promise<string | null> {
  const queryData: QueryArPaymentByDocNoData = { docNumber };
  const queryResponse = await client.execute(
    queryArPaymentByDocNoTemplate,
    queryData,
    'getPaymentByDocNo'
  );

  if (!queryResponse.success) {
    return null;
  }

  const matches = ensureArray(extractData<Payment>(queryResponse, 'ARPYMT'));
  return matches[0]?.RECORDNO ? String(matches[0].RECORDNO) : null;
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

  const payment = extractData<{ RECORDNO?: string; DOCNUMBER?: string }>(response, 'ARPYMT');
  const row = Array.isArray(payment) ? payment[0] : payment;
  const recordNo = row?.RECORDNO;

  return {
    success: true,
    recordNo,
    paymentId: row?.DOCNUMBER,
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
 * Get a single payment by record number or Payment ID (DOCNUMBER)
 */
export async function getPayment(
  client: SageClient,
  id: string
): Promise<GetPaymentResult> {
  let payment = await readPaymentByRecordNo(client, id);

  if (!payment) {
    const recordNo = await lookupPaymentRecordNoByDocNo(client, id);
    if (recordNo) {
      payment = await readPaymentByRecordNo(client, recordNo);
    }
  }

  if (!payment) {
    return {
      success: false,
      error: `Payment ${id} not found`,
    };
  }

  return enrichPaymentResult(client, payment);
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
