import { SageClient } from '../client.js';
import { queryCustomersTemplate, QueryCustomersData, readCustomerTemplate, ReadCustomerData } from '../templates/customer.js';
import { extractData, ensureArray } from '../parser.js';

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

/**
 * Get a single customer by ID
 */
export async function getCustomer(
  client: SageClient,
  customerId: string
): Promise<{ success: boolean; customer?: Customer; error?: string }> {
  const data: ReadCustomerData = { customerId };

  const response = await client.execute(readCustomerTemplate, data, 'getCustomer');

  if (!response.success) {
    return {
      success: false,
      error: response.error?.description || 'Failed to get customer',
    };
  }

  const customer = extractData<Customer>(response, 'CUSTOMER');
  
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
