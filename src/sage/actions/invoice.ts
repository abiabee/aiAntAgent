import { SageClient } from '../client.js';
import { 
  readInvoiceTemplate, 
  queryInvoiceByIdTemplate,
  queryOpenInvoicesTemplate,
  createInvoiceTemplate,
  deleteInvoiceTemplate,
  queryInvoicesByCustomerTemplate,
  queryMultipleInvoicesTemplate,
} from '../templates/invoice.js';
import type {
  ReadInvoiceData,
  QueryInvoiceByIdData,
  QueryOpenInvoicesData,
  CreateInvoiceData,
  InvoiceLineItem,
  DeleteInvoiceData,
  QueryInvoicesByCustomerData,
  QueryMultipleInvoicesData,
} from '../templates/invoice.js';
import { extractData, ensureArray } from '../parser.js';
import type { SageResponse } from '../parser.js';

export interface InvoiceLineItemData {
  RECORDNO: string;
  ACCOUNTNO: string;
  ACCOUNTTITLE?: string;
  AMOUNT: number;
  TRX_AMOUNT: number;
  ENTRYDESCRIPTION?: string;
  LOCATIONID?: string;
  LOCATIONNAME?: string;
  DEPARTMENTID?: string;
  DEPARTMENTNAME?: string;
  LINE_NO?: number;
  STATE?: string;
}

export interface InvoiceContact {
  CONTACTNAME?: string;
  COMPANYNAME?: string;
  EMAIL1?: string;
  PHONE1?: string;
  MAILADDRESS?: {
    ADDRESS1?: string;
    CITY?: string;
    STATE?: string;
    ZIP?: string;
    COUNTRY?: string;
  };
}

export interface Invoice {
  // Core identifiers
  RECORDNO: string;
  RECORDID: string;
  RECORDTYPE?: string;
  DOCNUMBER?: string;         // Reference number
  
  // Customer info
  CUSTOMERID: string;
  CUSTOMERNAME?: string;
  CUSTOMERRECORDNO?: string;
  
  // Amounts (base currency)
  TOTALENTERED?: number;
  TOTALPAID?: number;
  TOTALDUE?: number;
  TOTALSELECTED?: number;
  
  // Amounts (transaction currency)
  TRX_TOTALENTERED?: number;
  TRX_TOTALPAID?: number;
  TRX_TOTALDUE?: number;
  TRX_TOTALSELECTED?: number;
  TRX_TOTALDISCOUNTAPPLIED?: number;
  
  // Status
  STATE?: string;      // e.g., "Paid", "Submitted", "Posted", "Draft"
  RAWSTATE?: string;   // e.g., "P", "S", "D"
  
  // Currency
  CURRENCY?: string;
  BASECURR?: string;
  
  // Dates
  WHENCREATED?: string;
  WHENDUE?: string;
  WHENPAID?: string;
  WHENPOSTED?: string;
  WHENDISCOUNT?: string;
  WHENMODIFIED?: string;
  AUWHENCREATED?: string;    // Audit timestamp
  DUE_IN_DAYS?: string;
  
  // Description & notes
  DESCRIPTION?: string;
  DESCRIPTION2?: string;
  
  // Terms
  TERMNAME?: string;
  TERMKEY?: string;
  TERMVALUE?: string;
  
  // Entity/Location
  MEGAENTITYID?: string;
  MEGAENTITYNAME?: string;
  MEGAENTITYKEY?: string;
  
  // Contacts
  BILLTOCONTACTNAME?: string;
  SHIPTOCONTACTNAME?: string;
  BILLTOPAYTOCONTACTNAME?: string;
  SHIPTORETURNTOCONTACTNAME?: string;
  CONTACT?: InvoiceContact;
  BILLTO?: InvoiceContact;
  SHIPTO?: InvoiceContact;
  
  // Batch info
  PRBATCH?: string;
  PRBATCHKEY?: string;
  
  // Delivery
  DELIVERY_OPTIONS?: string;
  
  // Custom fields / integrations
  SUPDOCID?: string;          // Attachment ID
  TOKEN_345?: string;         // Token field
  PAYSTAND_UUID?: string;     // Paystand UUID
  EXTERNALREFNO?: string;     // External reference
  EXTERNALURL?: string;       // External URL
  
  // Line items
  ARINVOICEITEMS?: {
    arinvoiceitem?: InvoiceLineItemData | InvoiceLineItemData[];
  };
  
  // Audit
  CREATEDBY?: string;
  MODIFIEDBY?: string;
  CREATEDBYLOGINID?: string;
  MODIFIEDBYLOGINID?: string;
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
    baseCurrency?: string;
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
    baseCurrency: invoiceData.baseCurrency,
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
  // Check both uppercase and lowercase keys (API may return either)
  const createdInvoice = responseData?.ARINVOICE || responseData?.arinvoice;
  if (createdInvoice) {
    const inv = createdInvoice as Record<string, unknown>;
    recordNo = String(inv.RECORDNO || inv.recordno || '');
    recordId = String(inv.RECORDID || inv.recordid || '');
  } else if (responseData?.['@_key']) {
    recordNo = String(responseData['@_key']);
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

/**
 * List invoices for a specific customer
 */
export async function listInvoicesByCustomer(
  client: SageClient,
  customerId: string,
  options: { pageSize?: number } = {}
): Promise<InvoicesResult> {
  const data: QueryInvoicesByCustomerData = {
    customerId,
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryInvoicesByCustomerTemplate, data, 'listInvoicesByCustomer');

  if (!response.success) {
    return {
      success: false,
      invoices: [],
      error: response.error?.description || 'Failed to list invoices for customer',
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
 * Get multiple invoices by their Invoice IDs (RECORDID)
 */
export async function getMultipleInvoices(
  client: SageClient,
  invoiceIds: string[]
): Promise<InvoicesResult> {
  const data: QueryMultipleInvoicesData = { invoiceIds };

  const response = await client.execute(queryMultipleInvoicesTemplate, data, 'getMultipleInvoices');

  if (!response.success) {
    return {
      success: false,
      invoices: [],
      error: response.error?.description || 'Failed to get invoices',
    };
  }

  const rawInvoices = extractData<Invoice>(response, 'ARINVOICE');
  const invoices = ensureArray(rawInvoices);

  return {
    success: true,
    invoices,
  };
}
