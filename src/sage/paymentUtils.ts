/**
 * AR payment detail parsing — patterns from roadrunner sage-intacct.js
 * (getCombinedAmountFromPayments, ARPYMTDETAILS / ARPYMTENTRIES)
 */

import { ensureArray } from './parser.js';

export interface PaymentDetailRow {
  RECORDNO?: string;
  RECORDKEY?: string;
  ENTRYKEY?: string;
  POSADJKEY?: string;
  ADJUSTMENTKEY?: string;
  ADJUSTMENTENTRYKEY?: string;
  INLINEKEY?: string;
  INLINEENTRYKEY?: string;
  TRX_PAYMENTAMOUNT?: string | number;
  TRX_ADJUSTMENTAMOUNT?: string | number;
  TRX_INLINEAMOUNT?: string | number;
  TRX_POSTEDADVANCEAMOUNT?: string | number;
  TRX_NEGATIVEINVOICEAMOUNT?: string | number;
  TRX_POSTEDOVERPAYMENTAMOUNT?: string | number;
  ENTRYDESCRIPTION?: string;
  PAYMENTENTRYKEY?: string;
}

export interface PaymentEntryRow {
  RECORDNO?: string;
  LOCATIONID?: string;
  TRX_PAYMENTAMOUNT?: string | number;
  PAYMENTAMOUNT?: string | number;
}

export interface PaymentCreditBreakdown {
  adjustment: number;
  inline: number;
  advance: number;
  negativeInvoice: number;
  overpayment: number;
}

export interface PaymentApplication {
  invoiceRecordNo: string;
  invoiceId?: string;
  cashAmount: number;
  creditAmount: number;
  totalApplied: number;
  credits: PaymentCreditBreakdown;
  description?: string;
  adjustmentKey?: string;
  inlineKey?: string;
}

export interface PaymentAmountSummary {
  totalPaid: number;
  totalSelected: number;
  totalCash: number;
  totalCredits: number;
  currency: string;
}

function toNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getNestedArray<T>(
  parent: Record<string, unknown> | undefined,
  containerKey: string,
  itemKey: string
): T[] {
  if (!parent) {
    return [];
  }

  const container =
    parent[containerKey] ??
    parent[containerKey.toLowerCase()];

  if (!container || typeof container !== 'object') {
    return [];
  }

  const obj = container as Record<string, unknown>;
  const items = obj[itemKey] ?? obj[itemKey.toLowerCase()];
  return ensureArray(items as T | T[] | null);
}

export function extractPaymentDetails(payment: Record<string, unknown>): PaymentDetailRow[] {
  return getNestedArray<PaymentDetailRow>(payment, 'ARPYMTDETAILS', 'ARPYMTDETAIL').filter(
    (row) => row && (row.RECORDKEY || row.RECORDNO)
  );
}

export function extractPaymentEntries(payment: Record<string, unknown>): PaymentEntryRow[] {
  return getNestedArray<PaymentEntryRow>(payment, 'ARPYMTENTRIES', 'ARPYMTENTRY');
}

export function getCreditBreakdown(detail: PaymentDetailRow): PaymentCreditBreakdown {
  return {
    adjustment: toNumber(detail.TRX_ADJUSTMENTAMOUNT),
    inline: toNumber(detail.TRX_INLINEAMOUNT),
    advance: toNumber(detail.TRX_POSTEDADVANCEAMOUNT),
    negativeInvoice: toNumber(detail.TRX_NEGATIVEINVOICEAMOUNT),
    overpayment: toNumber(detail.TRX_POSTEDOVERPAYMENTAMOUNT),
  };
}

export function getCreditAmountFromDetail(detail: PaymentDetailRow): number {
  const credits = getCreditBreakdown(detail);
  return roundMoney(
    credits.adjustment +
      credits.inline +
      credits.advance +
      credits.negativeInvoice +
      credits.overpayment
  );
}

/**
 * Sum cash + all credit types applied to an invoice line (roadrunner getCombinedAmountFromPayments).
 */
export function getCombinedAmountFromDetail(detail: PaymentDetailRow): number {
  let amountPaid = 0;
  const paymentAmount = toNumber(detail.TRX_PAYMENTAMOUNT);
  const credits = getCreditBreakdown(detail);

  if (paymentAmount) {
    amountPaid = paymentAmount;
  }
  if (credits.inline) {
    amountPaid += credits.inline;
  }
  if (credits.advance) {
    amountPaid += credits.advance;
  }
  if (credits.negativeInvoice) {
    amountPaid += credits.negativeInvoice;
  }
  if (credits.overpayment) {
    amountPaid += credits.overpayment;
  }
  if (credits.adjustment) {
    amountPaid += credits.adjustment;
  }

  return roundMoney(amountPaid);
}

export function buildPaymentApplications(
  details: PaymentDetailRow[],
  invoiceIdByRecordNo: Map<string, string> = new Map()
): PaymentApplication[] {
  return details
    .map((detail) => {
      const invoiceRecordNo = String(detail.RECORDKEY || detail.RECORDNO || '');
      const cashAmount = toNumber(detail.TRX_PAYMENTAMOUNT);
      const credits = getCreditBreakdown(detail);
      const creditAmount = getCreditAmountFromDetail(detail);
      const totalApplied = getCombinedAmountFromDetail(detail);

      return {
        invoiceRecordNo,
        invoiceId: invoiceIdByRecordNo.get(invoiceRecordNo),
        cashAmount: roundMoney(cashAmount),
        creditAmount,
        totalApplied,
        credits,
        description: detail.ENTRYDESCRIPTION,
        adjustmentKey: detail.POSADJKEY || detail.ADJUSTMENTKEY,
        inlineKey: detail.INLINEKEY,
      };
    })
    .filter((row) => row.invoiceRecordNo && row.totalApplied !== 0);
}

export function summarizePaymentAmounts(
  payment: Record<string, unknown>,
  applications: PaymentApplication[]
): PaymentAmountSummary {
  const currency = String(payment.CURRENCY || payment.BASECURR || 'USD');
  const totalPaid = toNumber(
    (payment.TRX_TOTALPAID ?? payment.TOTALPAID) as string | number | undefined
  );
  const totalSelected = toNumber(
    (payment.TRX_TOTALSELECTED ?? payment.TOTALSELECTED) as string | number | undefined
  );

  const totalCash = roundMoney(applications.reduce((sum, row) => sum + row.cashAmount, 0));
  const totalCredits = roundMoney(applications.reduce((sum, row) => sum + row.creditAmount, 0));

  return {
    totalPaid: roundMoney(totalPaid || totalCash + totalCredits),
    totalSelected: roundMoney(totalSelected || totalPaid),
    totalCash,
    totalCredits,
    currency,
  };
}

export function formatCreditSources(credits: PaymentCreditBreakdown): string {
  const parts: string[] = [];
  if (credits.adjustment) parts.push(`memo ${credits.adjustment}`);
  if (credits.inline) parts.push(`inline ${credits.inline}`);
  if (credits.advance) parts.push(`advance ${credits.advance}`);
  if (credits.negativeInvoice) parts.push(`neg.inv ${credits.negativeInvoice}`);
  if (credits.overpayment) parts.push(`overpay ${credits.overpayment}`);
  return parts.length > 0 ? parts.join(', ') : '-';
}
