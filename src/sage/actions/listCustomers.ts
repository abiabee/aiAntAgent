import { SageClient } from '../client.js';
import { 
  queryCustomersTemplate, 
  readCustomerTemplate,
  searchCustomerTemplate,
} from '../templates/customer.js';
import type { 
  QueryCustomersData, 
  ReadCustomerData,
  SearchCustomerData,
} from '../templates/customer.js';
import { extractData, ensureArray } from '../parser.js';

export interface CustomerAddress {
  ADDRESS1?: string;
  ADDRESS2?: string;
  ADDRESS3?: string;
  CITY?: string;
  STATE?: string;
  ZIP?: string;
  COUNTRY?: string;
  COUNTRYCODE?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

export interface CustomerContact {
  CONTACTNAME?: string;
  COMPANYNAME?: string;
  PREFIX?: string;
  FIRSTNAME?: string;
  LASTNAME?: string;
  INITIAL?: string;
  PRINTAS?: string;
  TAXABLE?: string;
  TAXGROUP?: string;
  TAXID?: string;
  PHONE1?: string;
  PHONE2?: string;
  CELLPHONE?: string;
  PAGER?: string;
  FAX?: string;
  EMAIL1?: string;
  EMAIL2?: string;
  URL1?: string;
  URL2?: string;
  VISIBLE?: string;
  STATUS?: string;
  MAILADDRESS?: CustomerAddress;
}

export interface CustomerEntityContact {
  RECORD?: string;
  RECORDNO?: string;
  CATEGORYNAME?: string;
  CONTACT?: { NAME?: string };
  ENTITY?: string;
  ISPRIMARY?: string;
  ISBILLTOPAYTO?: string;
  ISSHIPTORETURNTO?: string;
  CUSTOMERID?: string;
  CONTACTNAME?: string;
}

export interface CustomerFull {
  RECORDNO?: string;
  CUSTOMERID: string;
  NAME: string;
  ENTITY?: string;
  PARENTID?: string;
  PARENTNAME?: string;
  STATUS?: string;
  ONETIME?: string;
  ONHOLD?: string;
  
  // Terms & Billing
  TERMNAME?: string;
  TERMVALUE?: string;
  CURRENCY?: string;
  CREDITLIMIT?: string;
  TOTALDUE?: string;
  DELIVERY_OPTIONS?: string;
  
  // Representative
  CUSTREPID?: string;
  CUSTREPNAME?: string;
  
  // Classification
  CUSTTYPE?: string;
  GLGROUP?: string;
  TERRITORYID?: string;
  TERRITORYNAME?: string;
  SHIPPINGMETHOD?: string;
  PRICELIST?: string;
  PRICESCHEDULE?: string;
  DISCOUNT?: string;
  
  // Dates
  LAST_INVOICEDATE?: string;
  LAST_STATEMENTDATE?: string;
  WHENCREATED?: string;
  WHENMODIFIED?: string;
  
  // Payment Options
  ENABLEONLINECARDPAYMENT?: string;
  ENABLEONLINEACHPAYMENT?: string;
  
  // Audit
  CREATEDBY?: string;
  MODIFIEDBY?: string;
  CREATEDBYLOGINID?: string;
  MODIFIEDBYLOGINID?: string;
  
  // Accounts
  ARACCOUNT?: string;
  ARACCOUNTTITLE?: string;
  ACCOUNTLABEL?: string;
  
  // Custom Fields
  PAYSTAND_PAYER_ID__C?: string;
  
  // Contacts
  DISPLAYCONTACT?: CustomerContact;
  CONTACTINFO?: CustomerContact;
  BILLTO?: CustomerContact;
  SHIPTO?: CustomerContact;
  
  // All Customer Contacts
  CUSTOMERCONTACTS?: {
    customerentitycontacts?: CustomerEntityContact | CustomerEntityContact[];
  };
  
  // Entity info
  MEGAENTITYID?: string;
  MEGAENTITYNAME?: string;
  
  // Comments
  COMMENTS?: string;
  CUSTMESSAGE?: { MESSAGE?: string };
  
  // Health
  HEALTHSCORE?: string;
  HEALTHSTATUS?: string;
  CHURNRISK?: string;
}

export interface Customer {
  CUSTOMERID: string;
  NAME: string;
  STATUS?: string;
  TERMNAME?: string;
  CURRENCY?: string;
  EMAIL?: string;
  PHONE?: string;
  CONTACTNAME?: string;
}

export interface ListCustomersResult {
  success: boolean;
  customers: Customer[];
  error?: string;
}

/**
 * List customers from Sage Intacct
 */
export async function listCustomers(
  client: SageClient,
  options: { pageSize?: number; offset?: number } = {}
): Promise<ListCustomersResult> {
  const data: QueryCustomersData = {
    pageSize: options.pageSize || 100,
    offset: options.offset,
  };

  const response = await client.execute(queryCustomersTemplate, data, 'listCustomers');

  if (!response.success) {
    return {
      success: false,
      customers: [],
      error: response.error?.description || 'Failed to list customers',
    };
  }

  const rawCustomers = extractData<Customer>(response, 'CUSTOMER');
  const customers = ensureArray(rawCustomers);

  return {
    success: true,
    customers,
  };
}

export interface GetCustomerResult {
  success: boolean;
  customer?: CustomerFull;
  error?: string;
}

/**
 * Get a single customer by ID (full details)
 */
export async function getCustomer(
  client: SageClient,
  customerId: string
): Promise<GetCustomerResult> {
  const data: ReadCustomerData = { customerId };

  const response = await client.execute(readCustomerTemplate, data, 'getCustomer');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get customer',
    };
  }

  const customer = extractData<CustomerFull>(response, 'CUSTOMER');
  
  if (!customer || (Array.isArray(customer) && customer.length === 0)) {
    return {
      success: false,
      error: `Customer ${customerId} not found`,
    };
  }

  return {
    success: true,
    customer: Array.isArray(customer) ? customer[0] : customer,
  };
}

export interface SearchCustomersResult {
  success: boolean;
  customers: Customer[];
  error?: string;
}

/**
 * Search customers by name (partial match)
 */
export async function searchCustomers(
  client: SageClient,
  searchTerm: string,
  options: { pageSize?: number } = {}
): Promise<SearchCustomersResult> {
  const data: SearchCustomerData = {
    searchTerm,
    pageSize: options.pageSize || 20,
  };

  const response = await client.execute(searchCustomerTemplate, data, 'searchCustomers');

  if (!response.success) {
    return {
      success: false,
      customers: [],
      error: response.error?.description || 'Failed to search customers',
    };
  }

  const rawCustomers = extractData<Customer>(response, 'CUSTOMER');
  const customers = ensureArray(rawCustomers);

  return {
    success: true,
    customers,
  };
}
