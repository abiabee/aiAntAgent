import { SageClient } from '../client.js';
import { 
  readInvoiceTemplate, 
  ReadInvoiceData,
  queryInvoiceByIdTemplate,
  QueryInvoiceByIdData,
  queryOpenInvoicesTemplate,
  QueryOpenInvoicesData,
  createInvoiceTemplate,
  CreateInvoiceData,
  InvoiceLineItem,
  deleteInvoiceTemplate,
  DeleteInvoiceData
} from '../templates/invoice.js';
import { extractData, ensureArray, SageResponse } from '../parser.js';

export interface Invoice {
  RECORDNO: string;
  RECORDID: string;
  CUSTOMERID: string;
  CUSTOMERNAME?: string;
  TOTALENTERED?: number;
  TOTALPAID?: number;
  TOTALDUE?: number;
  TRX_TOTALENTERED?: number;
  TRX_TOTALPAID?: number;
  TRX_TOTALDUE?: number;
  STATE?: string;
  CURRENCY?: string;
  WHENCREATED?: string;
  WHENDUE?: string;
  DESCRIPTION?: string;
}

export interface InvoiceResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  rawResponse?: SageResponse;
}

export interface InvoicesResult {
  success: boolean;
  invoices: Invoice[];
  error?: string;
}

export interface CreateInvoiceResult {
  success: boolean;
  recordNo?: string;
  recordId?: string;
  error?: string;
  rawResponse?: SageResponse;
}

/**
 * Get invoice by RECORDNO
 */
export async function getInvoice(
  client: SageClient,
  recordNo: string
): Promise<InvoiceResult> {
  const data: ReadInvoiceData = { recordNo };

  const response = await client.execute(readInvoiceTemplate, data, 'getInvoice');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get invoice',
      rawResponse: response,
    };
  }

  const invoice = extractData<Invoice>(response, 'ARINVOICE');
  
  if (!invoice || (Array.isArray(invoice) && invoice.length === 0)) {
    return {
      success: false,
      error: `Invoice ${recordNo} not found`,
      rawResponse: response,
    };
  }

  return {
    success: true,
    invoice: Array.isArray(invoice) ? invoice[0] : invoice,
    rawResponse: response,
  };
}

/**
 * Query invoice by RECORDID (document number)
 */
export async function queryInvoiceById(
  client: SageClient,
  recordId: string
): Promise<InvoiceResult> {
  const data: QueryInvoiceByIdData = { recordId };

  const response = await client.execute(queryInvoiceByIdTemplate, data, 'queryInvoiceById');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to query invoice',
      rawResponse: response,
    };
  }

  const rawInvoices = extractData<Invoice>(response, 'ARINVOICE');
  const invoices = ensureArray(rawInvoices);
  
  if (invoices.length === 0) {
    return {
      success: false,
      error: `Invoice with ID ${recordId} not found`,
      rawResponse: response,
    };
  }

  return {
    success: true,
    invoice: invoices[0],
    rawResponse: response,
  };
}

/**
 * List open invoices (Posted or Partially Paid)
 */
export async function listOpenInvoices(
  client: SageClient,
  options: { pageSize?: number; offset?: number } = {}
): Promise<InvoicesResult> {
  const data: QueryOpenInvoicesData = {
    pageSize: options.pageSize || 50,
    offset: options.offset,
  };

  const response = await client.execute(queryOpenInvoicesTemplate, data, 'listOpenInvoices');

  if (!response.success) {
    return {
      success: false,
      invoices: [],
      error: response.error?.description || 'Failed to list invoices',
    };
  }

  const rawInvoices = extractData<Invoice>(response, 'ARINVOICE');
  const invoices = ensureArray(rawInvoices);

  return {
    success: true,
    invoices,
  };
}

/**
 * Create a new AR invoice
 */
export async function createInvoice(
  client: SageClient,
  invoiceData: {
    customerId: string;
    lineItems: InvoiceLineItem[];
    whenCreated?: string;
    whenDue?: string;
    termName?: string;
    description?: string;
    currency?: string;
  }
): Promise<CreateInvoiceResult> {
  // Default dates to today and 30 days from now
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const formatDate = (date: Date): string => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const data: CreateInvoiceData = {
    customerId: invoiceData.customerId,
    whenCreated: invoiceData.whenCreated || formatDate(today),
    whenDue: invoiceData.whenDue || formatDate(dueDate),
    termName: invoiceData.termName,
    description: invoiceData.description,
    currency: invoiceData.currency,
    lineItems: invoiceData.lineItems,
  };

  const response = await client.execute(createInvoiceTemplate, data, 'createInvoice');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to create invoice',
      rawResponse: response,
    };
  }

  // Extract the created invoice RECORDNO from response
  const responseData = response.data as Record<string, unknown>;
  let recordNo: string | undefined;
  let recordId: string | undefined;

  // The create response typically includes the key of the created record
  if (responseData?.ARINVOICE) {
    const invoice = responseData.ARINVOICE as Record<string, unknown>;
    recordNo = invoice.RECORDNO as string;
    recordId = invoice.RECORDID as string;
  } else if (responseData?.['@_key']) {
    recordNo = responseData['@_key'] as string;
  }

  return {
    success: true,
    recordNo,
    recordId,
    rawResponse: response,
  };
}

/**
 * Delete an invoice by RECORDNO
 */
export async function deleteInvoice(
  client: SageClient,
  recordNo: string
): Promise<{ success: boolean; error?: string }> {
  const data: DeleteInvoiceData = { recordNo };

  const response = await client.execute(deleteInvoiceTemplate, data, 'deleteInvoice');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to delete invoice',
    };
  }

  return { success: true };
}
