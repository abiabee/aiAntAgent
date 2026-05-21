#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { createClientFromEnv, SageClient } from './sage/client.js';
import { 
  getInvoice, 
  queryInvoiceById, 
  listOpenInvoices,
  listInvoicesByCustomer,
  getMultipleInvoices,
} from './sage/actions/invoice.js';
import type { Invoice, InvoiceResult } from './sage/actions/invoice.js';
import { listCustomers, getCustomer, searchCustomers } from './sage/actions/listCustomers.js';
import type { Customer, CustomerFull, CustomerContact, CustomerAddress, CustomerEntityContact } from './sage/actions/listCustomers.js';
import { listGlAccounts, listAccountLabels, GlAccount, AccountLabel } from './sage/actions/listGlAccounts.js';
import { listAllBankAccounts, BankAccount } from './sage/actions/bankAccount.js';
import { listPayments, getPayment, Payment, PaymentFull, PaymentDetail } from './sage/actions/payment.js';
import { listArAdjustments, getArAdjustment, queryArAdjustmentById, createArAdjustment, listCreditMemos, createCreditMemo } from './sage/actions/aradjustment.js';
import type { ArAdjustment, CreateArAdjustmentResult } from './sage/actions/aradjustment.js';
import { getMemoryStore, MemoryStore } from './memory/store.js';
import { formatSageErrors } from './sage/parser.js';
import { createInvoiceWithLearning, LearningAttempt } from './sage/learningInvoice.js';
import { createPaymentWithLearning, PaymentLearningAttempt } from './sage/learningPayment.js';
import { getKnowledgeStore } from './sage/knowledge.js';
import { describeErrorType } from './sage/errorClassifier.js';
import { 
  createTable, 
  invoiceColumns, 
  customerColumns, 
  glAccountColumns,
  printSuccess, 
  printError, 
  printInfo, 
  printHeader,
  printKeyValues,
  formatCurrency,
  formatRaw,
  formatStatus
} from './output/table.js';

// =============================================================================
// Command Parser
// =============================================================================

interface ParsedCommand {
  action: string;
  target?: string;
  count?: number;
  customerId?: string;
  customerName?: string;  // For searching by name
  amount?: number;
  glAccount?: string;
  recordNo?: string;
  invoiceId?: string;  // e.g., INV25948
  invoiceIds?: string[];  // Multiple invoice IDs: INV1, INV2, INV3
  contactType?: string;  // e.g., DISPLAYCONTACT, BILLTO, SHIPTO, CONTACTINFO
  paymentRecordNo?: string;
  paymentMethod?: string;
  bankAccountId?: string;
  adjustmentId?: string;  // e.g., ADJ-001
  adjustmentRecordNo?: string;
  invoiceNo?: string;  // For linking adjustment to an invoice
  description?: string;
  state?: string;  // For filtering by status: Paid, Posted, Submitted
  options: Record<string, string>;
}

/**
 * Parse a natural language command into structured data
 */
function parseCommand(input: string): ParsedCommand {
  const command: ParsedCommand = { action: 'unknown', options: {} };
  const lower = input.toLowerCase().trim();

  // Session commands
  if (lower.includes('session') || lower.includes('connect') || lower.includes('login')) {
    command.action = 'session';
    return command;
  }

  // Help
  if (lower === 'help' || lower === '?') {
    command.action = 'help';
    return command;
  }

  // Status
  if (lower === 'status') {
    command.action = 'status';
    return command;
  }

  // List commands
  if (lower.includes('list') || lower.includes('show') || lower.includes('get')) {
    // Note: order matters here - check more specific matches first
    // Credit memos - must check before adjustments since credit memos are a type of adjustment
    if (lower.includes('credit') && (lower.includes('memo') || lower.includes('memos'))) {
      command.action = 'list-creditmemos';
      const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
      if (customerMatch) {
        command.customerId = customerMatch[1];
      }
      // Extract state filter: "status paid", "state posted", "paid", "posted"
      const stateMatch = input.match(/(?:status|state)\s+(paid|posted|submitted|draft)/i) ||
                         input.match(/\b(paid|posted|submitted)\b(?!\s+customer)/i);
      if (stateMatch) {
        // Capitalize first letter for Sage API
        const stateValue = stateMatch[1].toLowerCase();
        command.state = stateValue.charAt(0).toUpperCase() + stateValue.slice(1);
      }
      return command;
    }
    
    if ((lower.includes('adjustment') || lower.includes('advance')) && 
        !lower.includes('get') && !lower.includes('fetch')) {
      command.action = 'list-adjustments';
      // Check for "for customer X" filter
      const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
      if (customerMatch) {
        command.customerId = customerMatch[1];
      }
    } else if (lower.includes('payment') && !lower.includes('get') && !lower.includes('fetch')) {
      command.action = 'list-payments';
      // Check for "for customer X" filter
      const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
      if (customerMatch) {
        command.customerId = customerMatch[1];
      }
    } else if (lower.includes('customer')) {
      command.action = 'list-customers';
    } else if (lower.includes('bank')) {
      command.action = 'list-bank-accounts';
    } else if (lower.includes('invoice')) {
      command.action = 'list-invoices';
    } else if (lower.includes('account') || lower.includes('gl')) {
      command.action = 'list-accounts';
    } else if (lower.includes('label')) {
      command.action = 'list-labels';
    } else if (lower.includes('default') || lower.includes('memory')) {
      command.action = 'show-defaults';
    }
    return command;
  }

  // Get/fetch specific record
  if (lower.includes('get') || lower.includes('fetch') || lower.includes('read')) {
    if (lower.includes('invoice')) {
      // Check for "get invoices for customer X" first
      const forCustomerMatch = input.match(/invoices?\s+(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
      if (forCustomerMatch) {
        command.action = 'get-invoices-for-customer';
        command.customerId = forCustomerMatch[1];
        return command;
      }
      
      // Check for multiple invoices: "get invoices INV1, INV2, INV3"
      const multipleMatch = input.match(/invoices?\s+((?:INV\d+(?:\s*,\s*)?)+)/i);
      if (multipleMatch) {
        const ids = multipleMatch[1].split(/\s*,\s*/).map(id => id.trim().toUpperCase());
        if (ids.length > 1) {
          command.action = 'get-invoices-multiple';
          command.invoiceIds = ids;
          return command;
        }
      }
      
      command.action = 'get-invoice';
      // Extract invoice ID (e.g., INV25948) or record number
      const invoiceIdMatch = input.match(/(?:invoice\s+)?(INV\d+)/i);
      if (invoiceIdMatch) {
        command.invoiceId = invoiceIdMatch[1].toUpperCase();
      } else {
        // Extract record number
        const match = lower.match(/(?:invoice|#|recordno|record)\s*(\d+)/i);
        if (match) {
          command.recordNo = match[1];
        }
      }
    } else if (lower.includes('payment')) {
      command.action = 'get-payment';
      // Extract payment record number
      const match = lower.match(/payment\s*#?\s*(\d+)/i);
      if (match) {
        command.paymentRecordNo = match[1];
      }
    } else if (lower.includes('adjustment') || lower.includes('advance')) {
      command.action = 'get-adjustment';
      // Check for "for customer X" filter first
      const forCustomerMatch = input.match(/adjustments?\s+(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
      if (forCustomerMatch) {
        command.action = 'list-adjustments';
        command.customerId = forCustomerMatch[1];
        return command;
      }
      // Extract adjustment ID (e.g., ADJ-001 or just alphanumeric)
      const adjIdMatch = input.match(/(?:adjustment|advance)\s+([A-Za-z0-9_-]+)/i);
      if (adjIdMatch) {
        const value = adjIdMatch[1];
        // If it's purely numeric, it's a RECORDNO
        if (/^\d+$/.test(value)) {
          command.adjustmentRecordNo = value;
        } else {
          // Otherwise it's a RECORDID (adjustment number)
          command.adjustmentId = value;
        }
      }
    } else if (lower.includes('customer')) {
      command.action = 'get-customer';
      // Check for contact subcommand: "get customer CUSTID contact CONTACTTYPE"
      const contactMatch = input.match(/customer\s+([A-Za-z0-9_-]+)\s+contact(?:\s+(\w+))?/i);
      if (contactMatch) {
        command.customerId = contactMatch[1];
        command.contactType = contactMatch[2]?.toUpperCase() || 'ALL';
        command.action = 'get-customer-contact';
      } else {
        // Check if it looks like a name (contains spaces or starts with quote)
        const nameMatch = input.match(/customer\s+["']([^"']+)["']/i) ||
                          input.match(/customer\s+(.+)$/i);
        if (nameMatch) {
          const value = nameMatch[1].trim();
          // If it looks like an ID (alphanumeric, no spaces, reasonable length)
          if (/^[A-Za-z0-9_-]+$/.test(value) && value.length <= 20) {
            command.customerId = value;
          } else {
            // Treat as a name search
            command.action = 'search-customer';
            command.customerName = value;
          }
        }
      }
    }
    return command;
  }

  // Pay invoice: "pay invoice INV25948" or "pay invoice 54284 amount 100"
  if (lower.includes('pay') && lower.includes('invoice')) {
    command.action = 'pay-invoice';
    
    // Extract invoice ID (e.g., INV25948) or record number
    const invoiceIdMatch = input.match(/invoice\s+(INV\d+)/i);
    if (invoiceIdMatch) {
      command.invoiceId = invoiceIdMatch[1].toUpperCase();
    } else {
      const recordMatch = input.match(/invoice\s+(\d+)/i);
      if (recordMatch) {
        command.recordNo = recordMatch[1];
      }
    }

    // Extract amount: "amount 100" or "$100"
    const amountMatch = lower.match(/\$([\d.]+)|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2]);
    }

    // Extract payment method: "method Cash" or "method EFT"
    const methodMatch = input.match(/method\s+(\w+)/i);
    if (methodMatch) {
      command.paymentMethod = methodMatch[1];
    }

    // Extract bank account: "bank BOA" or "account BOA"
    const bankMatch = input.match(/(?:bank|account)\s+([A-Za-z0-9_-]+)/i);
    if (bankMatch && !lower.includes('gl account')) {
      command.bankAccountId = bankMatch[1];
    }

    return command;
  }

  // Create invoice
  if (lower.includes('create') && lower.includes('invoice')) {
    command.action = 'create-invoice';
    
    // Extract count: "create 5 invoices"
    const countMatch = lower.match(/create\s+(\d+)\s+invoice/i);
    if (countMatch) {
      command.count = parseInt(countMatch[1], 10);
    } else {
      command.count = 1;
    }

    // Extract customer: "for customer X" or "customer X"
    const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
    if (customerMatch) {
      command.customerId = customerMatch[1];
    }

    // Extract amount: "$100" or "100 dollars" or "amount 100" or just a decimal after customer ID
    // Note: Shell may interpret $X as variable, so also look for patterns like "858.6" at end
    // Must have $ prefix or "dollars" suffix or "amount" prefix to distinguish from count
    const amountMatch = input.match(/\$([\d.]+)|(\d+\.?\d*)\s*dollars?|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2] || amountMatch[3]);
    } else {
      // Fallback: look for a decimal number at the end that's not the customer ID or count
      // Pattern: after customer ID, look for a standalone decimal number
      const fallbackMatch = input.match(/customer\s+[A-Za-z0-9_-]+\s+(\d+\.\d+)\s*$/i);
      if (fallbackMatch) {
        command.amount = parseFloat(fallbackMatch[1]);
      }
    }

    // Extract GL account
    const glMatch = input.match(/(?:gl|account)\s*#?\s*([A-Za-z0-9_-]+)/i);
    if (glMatch) {
      command.glAccount = glMatch[1];
    }

    return command;
  }

  // Create AR adjustment: "create 5 aradjustments for customer CUST-001"
  if (lower.includes('create') && (lower.includes('adjustment') || lower.includes('aradjustment'))) {
    command.action = 'create-adjustment';
    
    // Extract count: "create 5 adjustments"
    const countMatch = lower.match(/create\s+(\d+)\s+(?:ar)?adjustment/i);
    if (countMatch) {
      command.count = parseInt(countMatch[1], 10);
    } else {
      command.count = 1;
    }

    // Extract customer: "for customer X" or "customer X"
    const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
    if (customerMatch) {
      command.customerId = customerMatch[1];
    }

    // Extract amount: "$100" or "amount 100"
    const amountMatch = input.match(/\$([\d.]+)|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2]);
    } else {
      // Fallback: look for a decimal number at the end
      const fallbackMatch = input.match(/customer\s+[A-Za-z0-9_-]+\s+(\d+\.?\d*)\s*$/i);
      if (fallbackMatch) {
        command.amount = parseFloat(fallbackMatch[1]);
      }
    }

    // Extract invoice number: "invoice INV12345" or "for invoice INV12345"
    const invoiceMatch = input.match(/(?:for\s+)?invoice\s+(INV[A-Za-z0-9_-]+|\d+)/i);
    if (invoiceMatch) {
      command.invoiceNo = invoiceMatch[1];
    }

    // Extract GL account
    const glMatch = input.match(/(?:gl|account)\s*#?\s*([A-Za-z0-9_-]+)/i);
    if (glMatch) {
      command.glAccount = glMatch[1];
    }

    // Extract description
    const descMatch = input.match(/description\s+["']([^"']+)["']/i) ||
                      input.match(/desc\s+["']([^"']+)["']/i);
    if (descMatch) {
      command.description = descMatch[1];
    }

    return command;
  }

  // Create credit memo: "create 5 creditmemos for customer CUST-001"
  if (lower.includes('create') && lower.includes('credit') && (lower.includes('memo') || lower.includes('memos'))) {
    command.action = 'create-creditmemo';
    
    // Extract count: "create 5 credit memos"
    const countMatch = lower.match(/create\s+(\d+)\s+credit/i);
    if (countMatch) {
      command.count = parseInt(countMatch[1], 10);
    } else {
      command.count = 1;
    }

    // Extract customer: "for customer X" or "customer X"
    const customerMatch = input.match(/(?:for\s+)?customer\s+([A-Za-z0-9_-]+)/i);
    if (customerMatch) {
      command.customerId = customerMatch[1];
    }

    // Extract amount: "$100" or "amount 100" (will be negated automatically)
    const amountMatch = input.match(/\$([\d.]+)|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2]);
    } else {
      const fallbackMatch = input.match(/customer\s+[A-Za-z0-9_-]+\s+(\d+\.?\d*)\s*$/i);
      if (fallbackMatch) {
        command.amount = parseFloat(fallbackMatch[1]);
      }
    }

    // Extract GL account
    const glMatch = input.match(/(?:gl|account)\s*#?\s*([A-Za-z0-9_-]+)/i);
    if (glMatch) {
      command.glAccount = glMatch[1];
    }

    // Extract description
    const descMatch = input.match(/description\s+["']([^"']+)["']/i) ||
                      input.match(/desc\s+["']([^"']+)["']/i);
    if (descMatch) {
      command.description = descMatch[1];
    }

    return command;
  }

  // Set defaults
  if (lower.includes('set') && lower.includes('default')) {
    command.action = 'set-default';
    
    if (lower.includes('customer')) {
      const match = input.match(/customer\s+([A-Za-z0-9_-]+)/i);
      if (match) {
        command.options.customerId = match[1];
      }
    }
    if (lower.includes('account') || lower.includes('gl')) {
      const match = input.match(/(?:gl|account)\s*#?\s*([A-Za-z0-9_-]+)/i);
      if (match) {
        command.options.glAccountNo = match[1];
      }
    }
    if (lower.includes('amount')) {
      const match = lower.match(/amount\s*([\d.]+)/i);
      if (match) {
        command.options.defaultAmount = match[1];
      }
    }
    return command;
  }

  // Reset/clear knowledge
  if ((lower.includes('reset') || lower.includes('clear')) && 
      (lower.includes('knowledge') || lower.includes('learned') || lower.includes('learning'))) {
    command.action = 'reset-knowledge';
    return command;
  }

  return command;
}

// =============================================================================
// Command Handlers
// =============================================================================

async function handleSession(client: SageClient): Promise<void> {
  printHeader('Creating Sage Intacct Session');
  
  try {
    const session = await client.createSession();
    printSuccess('Session created successfully!');
    printKeyValues({
      'Session ID': session.sessionId.substring(0, 30) + '...',
      'Endpoint': session.endpoint,
      'Created': session.createdAt.toISOString(),
    });
  } catch (error) {
    printError(`Failed to create session: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleListInvoices(client: SageClient): Promise<void> {
  printHeader('Open Invoices');
  
  const result = await listOpenInvoices(client, { pageSize: 20 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list invoices');
    return;
  }

  if (result.invoices.length === 0) {
    printInfo('No open invoices found');
    return;
  }

  console.log(createTable(result.invoices, invoiceColumns));
  printInfo(`Found ${result.invoices.length} invoice(s)`);
}

async function handleListCustomers(client: SageClient): Promise<void> {
  printHeader('Customers');
  
  const result = await listCustomers(client, { pageSize: 20 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list customers');
    return;
  }

  if (result.customers.length === 0) {
    printInfo('No customers found');
    return;
  }

  console.log(createTable(result.customers, customerColumns));
  printInfo(`Found ${result.customers.length} customer(s)`);
}

async function handleSearchCustomer(client: SageClient, searchTerm: string): Promise<void> {
  printHeader(`Search Customers: "${searchTerm}"`);
  
  const result = await searchCustomers(client, searchTerm, { pageSize: 20 });
  
  if (!result.success) {
    printError(result.error || 'Failed to search customers');
    return;
  }

  if (result.customers.length === 0) {
    printInfo('No customers found matching that name');
    return;
  }

  console.log(createTable(result.customers, customerColumns));
  printInfo(`Found ${result.customers.length} customer(s)`);
  
  if (result.customers.length === 1) {
    console.log();
    printInfo(`To view details: get customer ${result.customers[0].CUSTOMERID}`);
  }
}

async function handleGetInvoicesForCustomer(client: SageClient, customerId: string): Promise<void> {
  printHeader(`Invoices for Customer ${customerId}`);
  
  const result = await listInvoicesByCustomer(client, customerId, { pageSize: 50 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list invoices');
    return;
  }

  if (result.invoices.length === 0) {
    printInfo(`No invoices found for customer ${customerId}`);
    return;
  }

  const columns = [
    { key: 'RECORDID', header: 'Invoice ID', width: 15, format: formatRaw },
    { key: 'WHENCREATED', header: 'Date', width: 12 },
    { key: 'WHENPOSTED', header: 'GL Posted', width: 12 },
    { key: 'TRX_TOTALENTERED', header: 'Amount', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'TRX_TOTALDUE', header: 'Due', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'STATE', header: 'Status', width: 15, format: formatStatus },
    { key: 'MEGAENTITYID', header: 'Entity', width: 10 },
  ];

  console.log(createTable(result.invoices as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.invoices.length} invoice(s)`);
}

async function handleGetMultipleInvoices(client: SageClient, invoiceIds: string[]): Promise<void> {
  printHeader(`Invoices: ${invoiceIds.join(', ')}`);
  
  const result = await getMultipleInvoices(client, invoiceIds);
  
  if (!result.success) {
    printError(result.error || 'Failed to get invoices');
    return;
  }

  if (result.invoices.length === 0) {
    printInfo('No invoices found');
    return;
  }

  // Show summary table with customer info
  const columns = [
    { key: 'RECORDID', header: 'Invoice ID', width: 15, format: formatRaw },
    { key: 'CUSTOMERID', header: 'Customer', width: 15, format: formatRaw },
    { key: 'CUSTOMERNAME', header: 'Customer Name', width: 20 },
    { key: 'WHENCREATED', header: 'Date', width: 12 },
    { key: 'WHENPOSTED', header: 'GL Posted', width: 12 },
    { key: 'TRX_TOTALENTERED', header: 'Amount', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'STATE', header: 'Status', width: 12, format: formatStatus },
    { key: 'MEGAENTITYID', header: 'Entity', width: 10 },
  ];

  console.log(createTable(result.invoices as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.invoices.length} of ${invoiceIds.length} invoice(s)`);
  
  // List any not found
  const foundIds = result.invoices.map(inv => inv.RECORDID);
  const notFound = invoiceIds.filter(id => !foundIds.includes(id));
  if (notFound.length > 0) {
    console.log();
    printInfo(chalk.yellow(`Not found: ${notFound.join(', ')}`));
  }
}

// =============================================================================
// AR Adjustment Handlers
// =============================================================================

async function handleListAdjustments(client: SageClient, customerId?: string): Promise<void> {
  const header = customerId 
    ? `AR Adjustments for Customer ${customerId}` 
    : 'AR Adjustments';
  printHeader(header);
  
  const result = await listArAdjustments(client, { customerId, pageSize: 50 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list AR adjustments');
    return;
  }

  if (result.adjustments.length === 0) {
    printInfo('No AR adjustments found');
    return;
  }

  const columns = [
    { key: 'RECORDID', header: 'Adjustment ID', width: 15, format: formatRaw },
    { key: 'RECORDNO', header: 'Record#', width: 10, format: formatRaw },
    { key: 'CUSTOMERID', header: 'Customer', width: 12, format: formatRaw },
    { key: 'CUSTOMERNAME', header: 'Customer Name', width: 18 },
    { key: 'WHENCREATED', header: 'Date', width: 12 },
    { key: 'TRX_TOTALENTERED', header: 'Amount', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'TRX_TOTALDUE', header: 'Due', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'STATE', header: 'Status', width: 12, format: formatStatus },
    { key: 'MEGAENTITYID', header: 'Entity', width: 8 },
  ];

  console.log(createTable(result.adjustments as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.adjustments.length} AR adjustment(s)`);
}

async function handleGetAdjustment(
  client: SageClient, 
  options: { recordNo?: string; adjustmentId?: string }
): Promise<void> {
  const { recordNo, adjustmentId } = options;
  
  printHeader(`AR Adjustment Details`);
  
  let result;
  
  if (recordNo) {
    result = await getArAdjustment(client, recordNo);
  } else if (adjustmentId) {
    result = await queryArAdjustmentById(client, adjustmentId);
  } else {
    printError('No adjustment identifier provided');
    return;
  }
  
  if (!result.success || !result.adjustment) {
    printError(result.error || 'Failed to get adjustment');
    return;
  }

  const adj = result.adjustment;
  
  // Header section
  console.log(chalk.bold.cyan('\n┌─ Adjustment Header ─────────────────────────────────────────┐'));
  printKeyValues({
    'Adjustment ID': adj.RECORDID,
    'Record Number': adj.RECORDNO,
    'State': formatStatus(adj.STATE),
    'Description': adj.DESCRIPTION || '-',
  });

  // Amounts section
  console.log(chalk.bold.cyan('\n┌─ Amounts ────────────────────────────────────────────────────┐'));
  printKeyValues({
    'Total Entered': formatCurrency(adj.TRX_TOTALENTERED),
    'Total Paid': formatCurrency(adj.TRX_TOTALPAID),
    'Total Due': formatCurrency(adj.TRX_TOTALDUE),
    'Total Selected': formatCurrency(adj.TRX_TOTALSELECTED),
    'Currency': adj.CURRENCY || 'USD',
  });

  if (adj.TOTALENTERED !== adj.TRX_TOTALENTERED) {
    console.log(chalk.gray(`  Base amounts: Entered=${formatCurrency(adj.TOTALENTERED)}, Paid=${formatCurrency(adj.TOTALPAID)}, Due=${formatCurrency(adj.TOTALDUE)}`));
  }

  // Customer section
  console.log(chalk.bold.cyan('\n┌─ Customer ───────────────────────────────────────────────────┐'));
  printKeyValues({
    'Customer ID': adj.CUSTOMERID,
    'Customer Name': adj.CUSTOMERNAME || '-',
  });
  if (adj.BILLTOPAYTOCONTACTNAME) {
    console.log(`  Bill To: ${adj.BILLTOPAYTOCONTACTNAME}`);
  }
  if (adj.SHIPTORETURNTOCONTACTNAME) {
    console.log(`  Ship To: ${adj.SHIPTORETURNTOCONTACTNAME}`);
  }

  // Dates section
  console.log(chalk.bold.cyan('\n┌─ Dates ──────────────────────────────────────────────────────┐'));
  printKeyValues({
    'Created': adj.WHENCREATED || '-',
    'Posted': adj.WHENPOSTED || '-',
    'Paid': adj.WHENPAID || '-',
  });

  // Entity/Batch section
  if (adj.MEGAENTITYID || adj.PRBATCH) {
    console.log(chalk.bold.cyan('\n┌─ Entity & Batch ─────────────────────────────────────────────┐'));
    const entityInfo: Record<string, string> = {};
    if (adj.MEGAENTITYID) entityInfo['Entity'] = `${adj.MEGAENTITYID}${adj.MEGAENTITYNAME ? ` (${adj.MEGAENTITYNAME})` : ''}`;
    if (adj.PRBATCH) entityInfo['Batch'] = adj.PRBATCH;
    printKeyValues(entityInfo);
  }

  // Audit section
  if (adj.AUWHENCREATED || adj.WHENMODIFIED || adj.CREATEDBYLOGINID || adj.MODIFIEDBYLOGINID) {
    console.log(chalk.bold.cyan('\n┌─ Audit ──────────────────────────────────────────────────────┐'));
    const auditInfo: Record<string, string> = {};
    if (adj.AUWHENCREATED) auditInfo['Created At'] = adj.AUWHENCREATED;
    if (adj.CREATEDBYLOGINID) auditInfo['Created By'] = adj.CREATEDBYLOGINID;
    if (adj.WHENMODIFIED) auditInfo['Modified At'] = adj.WHENMODIFIED;
    if (adj.MODIFIEDBYLOGINID) auditInfo['Modified By'] = adj.MODIFIEDBYLOGINID;
    printKeyValues(auditInfo);
  }

  console.log();
}

async function handleCreateAdjustment(
  client: SageClient,
  memory: MemoryStore,
  cmd: ParsedCommand
): Promise<void> {
  const count = cmd.count || 1;
  printHeader(`Creating ${count} AR Adjustment(s)`);

  // Get defaults from knowledge store
  const knowledge = getKnowledgeStore();
  const invoiceKnowledge = await knowledge.getActionKnowledge('invoice');
  const defaults = await memory.getDefaults();

  // Use command values or defaults
  const customerId = cmd.customerId || invoiceKnowledge.workingDefaults.customerId || defaults.customerId;
  const glAccountNo = cmd.glAccount || invoiceKnowledge.workingDefaults.glAccountNo?.toString() || defaults.glAccountNo;
  const amount = cmd.amount || defaults.defaultAmount || 100;
  const currency = invoiceKnowledge.workingDefaults.currency || defaults.currency || 'USD';
  const locationId = invoiceKnowledge.workingDefaults.locationId?.toString();
  const departmentId = invoiceKnowledge.workingDefaults.departmentId?.toString();

  if (!customerId) {
    printError('Customer ID is required');
    printInfo('Usage: create adjustment for customer CUST-001');
    printInfo('   or: set default customer CUST-001');
    return;
  }

  if (!glAccountNo) {
    printError('GL Account is required');
    printInfo('Usage: create adjustment for customer CUST-001 gl account 60600');
    printInfo('   or: set default account 60600');
    return;
  }

  printInfo(`Starting values:`);
  printInfo(`  Customer: ${customerId}`);
  printInfo(`  GL Account: ${glAccountNo}`);
  printInfo(`  Amount: ${formatCurrency(amount)}`);
  printInfo(`  Currency: ${currency}`);
  if (cmd.invoiceNo) {
    printInfo(`  Invoice: ${cmd.invoiceNo}`);
  }
  if (locationId) {
    printInfo(`  Location: ${locationId}`);
  }
  if (departmentId) {
    printInfo(`  Department: ${departmentId}`);
  }
  console.log();

  const createdAdjustments: Array<{ recordNo: string; recordId?: string; amount: number; success: boolean }> = [];
  const failures: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < count; i++) {
    if (count > 1) {
      printInfo(`${chalk.bold(`Adjustment ${i + 1} of ${count}`)}`);
    }

    const result = await createArAdjustment(client, {
      customerId,
      amount,
      invoiceNo: cmd.invoiceNo,
      glAccountNo,
      description: cmd.description || `AR Adjustment ${i + 1} created by Sage Agent`,
      memo: `Adjustment ${i + 1}`,
      currency,
      locationId,
      departmentId,
    });

    if (result.success && result.recordNo) {
      printSuccess(`Created AR Adjustment: Record #${result.recordNo}${result.recordId ? ` (${result.recordId})` : ''}`);
      
      createdAdjustments.push({
        recordNo: result.recordNo,
        recordId: result.recordId,
        amount,
        success: true,
      });
    } else {
      const errorMsg = result.error || 'Unknown error';
      printError(`Failed to create adjustment: ${errorMsg}`);
      
      // Try to extract more details from raw response
      if (result.rawResponse?.error) {
        const errDetails = formatSageErrors(result.rawResponse.error);
        if (errDetails) {
          console.log(chalk.gray(`  Details: ${errDetails}`));
        }
      }
      
      failures.push({ index: i + 1, error: errorMsg });
    }

    if (count > 1 && i < count - 1) {
      console.log();
    }
  }

  // Summary
  if (count > 1) {
    console.log();
    printHeader('Summary');
    printInfo(`Created: ${createdAdjustments.length}`);
    printInfo(`Failed: ${failures.length}`);

    if (createdAdjustments.length > 0) {
      console.log();
      const columns = [
        { key: 'recordNo', header: 'Record #', width: 15, format: formatRaw },
        { key: 'recordId', header: 'Adjustment ID', width: 20, format: formatRaw },
        { key: 'amount', header: 'Amount', width: 12, format: formatCurrency },
      ];
      console.log(createTable(createdAdjustments as unknown as Record<string, unknown>[], columns));
    }

    if (failures.length > 0) {
      console.log();
      printInfo(chalk.red('Failures:'));
      for (const f of failures) {
        console.log(`  ${chalk.red(`#${f.index}:`)} ${f.error}`);
      }
    }
  }
}

// =============================================================================
// Credit Memo Handlers
// =============================================================================

async function handleListCreditMemos(
  client: SageClient, 
  customerId: string, 
  state?: string
): Promise<void> {
  const title = state 
    ? `Credit Memos for Customer ${customerId} (${state})`
    : `Credit Memos for Customer ${customerId}`;
  printHeader(title);
  
  if (!customerId) {
    printError('Customer ID is required');
    printInfo('Usage: get creditmemos for customer CUST-001');
    printInfo('       get creditmemos for customer CUST-001 status paid');
    printInfo('       get creditmemos for customer CUST-001 posted');
    return;
  }

  const result = await listCreditMemos(client, customerId, { state, pageSize: 50 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list credit memos');
    return;
  }

  if (result.adjustments.length === 0) {
    printInfo('No credit memos found for this customer');
    return;
  }

  const columns = [
    { key: 'RECORDID', header: 'Credit Memo ID', width: 15, format: formatRaw },
    { key: 'RECORDNO', header: 'Record#', width: 10, format: formatRaw },
    { key: 'RECORDTYPE', header: 'Type', width: 6 },
    { key: 'WHENCREATED', header: 'Date', width: 12 },
    { key: 'TRX_TOTALENTERED', header: 'Credit Amt', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'TRX_TOTALDUE', header: 'Available', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'STATE', header: 'Status', width: 12, format: formatStatus },
    { key: 'DESCRIPTION', header: 'Description', width: 20 },
    { key: 'MEGAENTITYID', header: 'Entity', width: 8 },
  ];

  console.log(createTable(result.adjustments as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.adjustments.length} credit memo(s)`);
  
  // Show totals
  const totalCredit = result.adjustments.reduce((sum, adj) => 
    sum + (Number(adj.TRX_TOTALENTERED) || 0), 0);
  const totalAvailable = result.adjustments.reduce((sum, adj) => 
    sum + (Number(adj.TRX_TOTALDUE) || 0), 0);
  
  console.log();
  printInfo(`Total Credit: ${formatCurrency(totalCredit)}`);
  printInfo(`Total Available: ${formatCurrency(totalAvailable)}`);
}

async function handleCreateCreditMemo(
  client: SageClient,
  memory: MemoryStore,
  cmd: ParsedCommand
): Promise<void> {
  const count = cmd.count || 1;
  printHeader(`Creating ${count} Credit Memo(s)`);

  // Get defaults from knowledge store
  const knowledge = getKnowledgeStore();
  const invoiceKnowledge = await knowledge.getActionKnowledge('invoice');
  const defaults = await memory.getDefaults();

  // Use command values or defaults
  const customerId = cmd.customerId || invoiceKnowledge.workingDefaults.customerId || defaults.customerId;
  const glAccountNo = cmd.glAccount || invoiceKnowledge.workingDefaults.glAccountNo?.toString() || defaults.glAccountNo;
  const amount = cmd.amount || defaults.defaultAmount || 25;  // Default credit amount
  const currency = invoiceKnowledge.workingDefaults.currency || defaults.currency || 'USD';
  const locationId = invoiceKnowledge.workingDefaults.locationId?.toString();
  const departmentId = invoiceKnowledge.workingDefaults.departmentId?.toString();

  if (!customerId) {
    printError('Customer ID is required');
    printInfo('Usage: create creditmemo for customer CUST-001');
    printInfo('   or: set default customer CUST-001');
    return;
  }

  if (!glAccountNo) {
    printError('GL Account is required');
    printInfo('Usage: create creditmemo for customer CUST-001 gl account 12100');
    printInfo('   or: set default account 12100');
    return;
  }

  printInfo(`Starting values:`);
  printInfo(`  Customer: ${customerId}`);
  printInfo(`  GL Account: ${glAccountNo}`);
  printInfo(`  Credit Amount: ${formatCurrency(amount)} ${chalk.gray('(will be negated)')}`);
  printInfo(`  Currency: ${currency}`);
  if (locationId) {
    printInfo(`  Location: ${locationId}`);
  }
  if (departmentId) {
    printInfo(`  Department: ${departmentId}`);
  }
  console.log();

  const createdMemos: Array<{ recordNo: string; recordId?: string; amount: number; success: boolean }> = [];
  const failures: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < count; i++) {
    if (count > 1) {
      printInfo(`${chalk.bold(`Credit Memo ${i + 1} of ${count}`)}`);
    }

    const result = await createCreditMemo(client, {
      customerId,
      amount,  // Will be negated by the function
      glAccountNo,
      description: cmd.description || `Credit memo ${i + 1} created by Sage Agent`,
      memo: `Credit available for checkout`,
      currency,
      baseCurrency: currency,
      locationId,
      departmentId,
    });

    if (result.success && result.recordNo) {
      printSuccess(`Created Credit Memo: Record #${result.recordNo}${result.recordId ? ` (${result.recordId})` : ''}`);
      printInfo(`  Amount: ${formatCurrency(-amount)} (credit)`);
      
      createdMemos.push({
        recordNo: result.recordNo,
        recordId: result.recordId,
        amount: -amount,
        success: true,
      });
    } else {
      const errorMsg = result.error || 'Unknown error';
      printError(`Failed to create credit memo: ${errorMsg}`);
      
      if (result.rawResponse?.error) {
        const errDetails = formatSageErrors(result.rawResponse.error);
        if (errDetails) {
          console.log(chalk.gray(`  Details: ${errDetails}`));
        }
      }
      
      failures.push({ index: i + 1, error: errorMsg });
    }

    if (count > 1 && i < count - 1) {
      console.log();
    }
  }

  // Summary
  if (count > 1) {
    console.log();
    printHeader('Summary');
    printInfo(`Created: ${createdMemos.length}`);
    printInfo(`Failed: ${failures.length}`);

    if (createdMemos.length > 0) {
      console.log();
      const columns = [
        { key: 'recordNo', header: 'Record #', width: 15, format: formatRaw },
        { key: 'recordId', header: 'Credit Memo ID', width: 20, format: formatRaw },
        { key: 'amount', header: 'Credit Amount', width: 15, format: formatCurrency },
      ];
      console.log(createTable(createdMemos as unknown as Record<string, unknown>[], columns));
    }

    if (failures.length > 0) {
      console.log();
      printInfo(chalk.red('Failures:'));
      for (const f of failures) {
        console.log(`  ${chalk.red(`#${f.index}:`)} ${f.error}`);
      }
    }
  }

  // Hint about verification
  if (createdMemos.length > 0) {
    console.log();
    printInfo(`To verify: get creditmemos for customer ${customerId}`);
    printInfo(`Credit memos should have RECORDTYPE=ra and negative amounts`);
  }
}

async function handleListAccounts(client: SageClient): Promise<void> {
  printHeader('GL Accounts');
  
  const result = await listGlAccounts(client, { pageSize: 30 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list GL accounts');
    return;
  }

  if (result.accounts.length === 0) {
    printInfo('No GL accounts found');
    return;
  }

  console.log(createTable(result.accounts, glAccountColumns));
  printInfo(`Found ${result.accounts.length} account(s)`);
}

async function handleListLabels(client: SageClient): Promise<void> {
  printHeader('Account Labels');
  
  const result = await listAccountLabels(client, { pageSize: 30 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list account labels');
    return;
  }

  if (result.labels.length === 0) {
    printInfo('No account labels found');
    return;
  }

  const columns = [
    { key: 'ACCOUNTLABEL', header: 'Label', width: 20 },
    { key: 'DESCRIPTION', header: 'Description', width: 35 },
    { key: 'GLACCOUNTNO', header: 'GL Account', width: 15 },
    { key: 'STATUS', header: 'Status', width: 10 },
  ];

  console.log(createTable(result.labels as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.labels.length} label(s)`);
}

/**
 * Helper to check if a value is non-empty
 */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

/**
 * Print key-values only for non-empty values
 */
function printNonEmptyKeyValues(data: Record<string, unknown>, indent = '  '): void {
  for (const [key, value] of Object.entries(data)) {
    if (hasValue(value)) {
      console.log(`${indent}${chalk.gray(key + ':')} ${value}`);
    }
  }
}

/**
 * Format an address for display
 */
function formatAddress(addr: CustomerAddress | undefined): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  
  if (hasValue(addr.ADDRESS1)) lines.push(addr.ADDRESS1!);
  if (hasValue(addr.ADDRESS2)) lines.push(addr.ADDRESS2!);
  if (hasValue(addr.ADDRESS3)) lines.push(addr.ADDRESS3!);
  
  const cityStateZip: string[] = [];
  if (hasValue(addr.CITY)) cityStateZip.push(addr.CITY!);
  if (hasValue(addr.STATE)) cityStateZip.push(addr.STATE!);
  if (hasValue(addr.ZIP)) cityStateZip.push(addr.ZIP!);
  if (cityStateZip.length > 0) {
    lines.push(cityStateZip.join(', '));
  }
  
  if (hasValue(addr.COUNTRY) && addr.COUNTRY !== 'United States') {
    lines.push(addr.COUNTRY!);
  }
  
  return lines;
}

/**
 * Display a contact section (DISPLAYCONTACT, BILLTO, SHIPTO, etc.)
 */
function displayContactSection(title: string, contact: CustomerContact | undefined): void {
  if (!contact) return;
  
  // Check if there's any meaningful data
  const hasData = Object.entries(contact).some(([key, value]) => {
    if (key === 'MAILADDRESS') {
      return contact.MAILADDRESS && formatAddress(contact.MAILADDRESS).length > 0;
    }
    return hasValue(value);
  });
  
  if (!hasData) return;
  
  console.log();
  console.log(chalk.bold.cyan(title));
  console.log();
  
  // Name info
  const nameInfo: Record<string, unknown> = {};
  if (hasValue(contact.CONTACTNAME)) nameInfo['Contact Name'] = contact.CONTACTNAME;
  if (hasValue(contact.COMPANYNAME)) nameInfo['Company'] = contact.COMPANYNAME;
  if (hasValue(contact.FIRSTNAME) || hasValue(contact.LASTNAME)) {
    const fullName = [contact.PREFIX, contact.FIRSTNAME, contact.INITIAL, contact.LASTNAME]
      .filter(hasValue).join(' ');
    if (fullName) nameInfo['Full Name'] = fullName;
  }
  if (hasValue(contact.PRINTAS)) nameInfo['Print As'] = contact.PRINTAS;
  printNonEmptyKeyValues(nameInfo);
  
  // Contact details
  const contactDetails: Record<string, unknown> = {};
  if (hasValue(contact.EMAIL1)) contactDetails['Email'] = contact.EMAIL1;
  if (hasValue(contact.EMAIL2)) contactDetails['Email 2'] = contact.EMAIL2;
  if (hasValue(contact.PHONE1)) contactDetails['Phone'] = contact.PHONE1;
  if (hasValue(contact.PHONE2)) contactDetails['Phone 2'] = contact.PHONE2;
  if (hasValue(contact.CELLPHONE)) contactDetails['Cell'] = contact.CELLPHONE;
  if (hasValue(contact.FAX)) contactDetails['Fax'] = contact.FAX;
  if (hasValue(contact.URL1)) contactDetails['Website'] = contact.URL1;
  if (hasValue(contact.URL2)) contactDetails['Website 2'] = contact.URL2;
  if (Object.keys(contactDetails).length > 0) {
    console.log();
    printNonEmptyKeyValues(contactDetails);
  }
  
  // Tax info
  const taxInfo: Record<string, unknown> = {};
  if (hasValue(contact.TAXABLE)) taxInfo['Taxable'] = contact.TAXABLE;
  if (hasValue(contact.TAXGROUP)) taxInfo['Tax Group'] = contact.TAXGROUP;
  if (hasValue(contact.TAXID)) taxInfo['Tax ID'] = contact.TAXID;
  if (Object.keys(taxInfo).length > 0) {
    console.log();
    printNonEmptyKeyValues(taxInfo);
  }
  
  // Address
  const addressLines = formatAddress(contact.MAILADDRESS);
  if (addressLines.length > 0) {
    console.log();
    console.log(chalk.gray('  Address:'));
    for (const line of addressLines) {
      console.log(`    ${line}`);
    }
  }
}

async function handleGetCustomer(
  client: SageClient,
  customerId: string
): Promise<void> {
  printHeader('Customer Details');
  
  if (!customerId) {
    printError('Please specify a customer ID');
    return;
  }

  printInfo(`Fetching customer: ${customerId}`);
  const result = await getCustomer(client, customerId);
  
  if (!result.success || !result.customer) {
    printError(result.error || 'Failed to get customer');
    return;
  }

  const customer = result.customer;
  
  // Status styling
  const statusColor = customer.STATUS === 'active' ? chalk.green :
                      customer.STATUS === 'inactive' ? chalk.red : chalk.white;

  // ═══════════════════════════════════════════════════════════════════════════
  // Header
  // ═══════════════════════════════════════════════════════════════════════════
  console.log();
  console.log(chalk.bold(`Customer -- ${customer.CUSTOMERID}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
  
  // Quick stats row
  const statsItems = [
    ['Name', customer.NAME || '-'],
    ['Status', statusColor(customer.STATUS || '-')],
    ['Terms', customer.TERMNAME || '-'],
    ['Currency', customer.CURRENCY || 'USD'],
    ['Total Due', customer.TOTALDUE ? formatCurrency(Number(customer.TOTALDUE)) : '-'],
  ];
  
  console.log(chalk.gray(statsItems.map(i => i[0]).join('  |  ')));
  console.log(statsItems.map(i => i[1]).join('  |  '));
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Basic Information
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.cyan('Basic Information'));
  console.log();
  
  const basicInfo: Record<string, unknown> = {};
  if (hasValue(customer.RECORDNO)) basicInfo['Record No'] = customer.RECORDNO;
  if (hasValue(customer.CUSTOMERID)) basicInfo['Customer ID'] = customer.CUSTOMERID;
  if (hasValue(customer.NAME)) basicInfo['Name'] = customer.NAME;
  if (hasValue(customer.ENTITY)) basicInfo['Entity'] = customer.ENTITY;
  if (hasValue(customer.PARENTID)) basicInfo['Parent ID'] = customer.PARENTID;
  if (hasValue(customer.PARENTNAME)) basicInfo['Parent Name'] = customer.PARENTNAME;
  if (hasValue(customer.STATUS)) basicInfo['Status'] = statusColor(customer.STATUS!);
  if (hasValue(customer.ONETIME) && customer.ONETIME === 'true') basicInfo['One-time'] = 'Yes';
  if (hasValue(customer.ONHOLD) && customer.ONHOLD === 'true') basicInfo['On Hold'] = chalk.red('Yes');
  printNonEmptyKeyValues(basicInfo);

  // ═══════════════════════════════════════════════════════════════════════════
  // Terms & Billing
  // ═══════════════════════════════════════════════════════════════════════════
  const hasTermsInfo = hasValue(customer.TERMNAME) || hasValue(customer.CREDITLIMIT) || 
                       hasValue(customer.TOTALDUE) || hasValue(customer.DELIVERY_OPTIONS);
  if (hasTermsInfo) {
    console.log();
    console.log(chalk.bold.cyan('Terms & Billing'));
    console.log();
    
    const termsInfo: Record<string, unknown> = {};
    if (hasValue(customer.TERMNAME)) termsInfo['Terms'] = customer.TERMNAME;
    if (hasValue(customer.CURRENCY)) termsInfo['Currency'] = customer.CURRENCY;
    if (hasValue(customer.CREDITLIMIT)) termsInfo['Credit Limit'] = formatCurrency(Number(customer.CREDITLIMIT));
    if (hasValue(customer.TOTALDUE)) termsInfo['Total Due'] = formatCurrency(Number(customer.TOTALDUE));
    if (hasValue(customer.DELIVERY_OPTIONS)) termsInfo['Delivery'] = customer.DELIVERY_OPTIONS;
    printNonEmptyKeyValues(termsInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════════
  const hasClassification = hasValue(customer.CUSTTYPE) || hasValue(customer.GLGROUP) || 
                           hasValue(customer.TERRITORYID) || hasValue(customer.PRICELIST);
  if (hasClassification) {
    console.log();
    console.log(chalk.bold.cyan('Classification'));
    console.log();
    
    const classInfo: Record<string, unknown> = {};
    if (hasValue(customer.CUSTTYPE)) classInfo['Customer Type'] = customer.CUSTTYPE;
    if (hasValue(customer.GLGROUP)) classInfo['GL Group'] = customer.GLGROUP;
    if (hasValue(customer.TERRITORYID)) classInfo['Territory'] = `${customer.TERRITORYID}${customer.TERRITORYNAME ? ` - ${customer.TERRITORYNAME}` : ''}`;
    if (hasValue(customer.SHIPPINGMETHOD)) classInfo['Shipping Method'] = customer.SHIPPINGMETHOD;
    if (hasValue(customer.PRICELIST)) classInfo['Price List'] = customer.PRICELIST;
    if (hasValue(customer.PRICESCHEDULE)) classInfo['Price Schedule'] = customer.PRICESCHEDULE;
    if (hasValue(customer.DISCOUNT)) classInfo['Discount'] = customer.DISCOUNT;
    printNonEmptyKeyValues(classInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Representative
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasValue(customer.CUSTREPID) || hasValue(customer.CUSTREPNAME)) {
    console.log();
    console.log(chalk.bold.cyan('Sales Representative'));
    console.log();
    
    const repInfo: Record<string, unknown> = {};
    if (hasValue(customer.CUSTREPID)) repInfo['Rep ID'] = customer.CUSTREPID;
    if (hasValue(customer.CUSTREPNAME)) repInfo['Rep Name'] = customer.CUSTREPNAME;
    printNonEmptyKeyValues(repInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Accounts
  // ═══════════════════════════════════════════════════════════════════════════
  const hasAccounts = hasValue(customer.ARACCOUNT) || hasValue(customer.ACCOUNTLABEL);
  if (hasAccounts) {
    console.log();
    console.log(chalk.bold.cyan('AR Accounts'));
    console.log();
    
    const accountInfo: Record<string, unknown> = {};
    if (hasValue(customer.ARACCOUNT)) accountInfo['AR Account'] = `${customer.ARACCOUNT}${customer.ARACCOUNTTITLE ? ` - ${customer.ARACCOUNTTITLE}` : ''}`;
    if (hasValue(customer.ACCOUNTLABEL)) accountInfo['Account Label'] = customer.ACCOUNTLABEL;
    printNonEmptyKeyValues(accountInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Payment Options
  // ═══════════════════════════════════════════════════════════════════════════
  const hasPaymentOptions = hasValue(customer.ENABLEONLINECARDPAYMENT) || hasValue(customer.ENABLEONLINEACHPAYMENT);
  if (hasPaymentOptions) {
    console.log();
    console.log(chalk.bold.cyan('Payment Options'));
    console.log();
    
    const paymentInfo: Record<string, unknown> = {};
    if (hasValue(customer.ENABLEONLINECARDPAYMENT)) {
      paymentInfo['Card Payment'] = customer.ENABLEONLINECARDPAYMENT === 'true' ? chalk.green('Enabled') : chalk.gray('Disabled');
    }
    if (hasValue(customer.ENABLEONLINEACHPAYMENT)) {
      paymentInfo['ACH Payment'] = customer.ENABLEONLINEACHPAYMENT === 'true' ? chalk.green('Enabled') : chalk.gray('Disabled');
    }
    if (hasValue(customer.PAYSTAND_PAYER_ID__C)) {
      paymentInfo['Paystand Payer ID'] = customer.PAYSTAND_PAYER_ID__C;
    }
    printNonEmptyKeyValues(paymentInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Contact Summary (show primary contact inline)
  // ═══════════════════════════════════════════════════════════════════════════
  const dc = customer.DISPLAYCONTACT;
  if (dc && (hasValue(dc.EMAIL1) || hasValue(dc.PHONE1) || hasValue(dc.CONTACTNAME))) {
    console.log();
    console.log(chalk.bold.cyan('Primary Contact'));
    console.log();
    
    const contactInfo: Record<string, unknown> = {};
    if (hasValue(dc.CONTACTNAME)) contactInfo['Name'] = dc.CONTACTNAME;
    if (hasValue(dc.COMPANYNAME) && dc.COMPANYNAME !== dc.CONTACTNAME) contactInfo['Company'] = dc.COMPANYNAME;
    if (hasValue(dc.EMAIL1)) contactInfo['Email'] = dc.EMAIL1;
    if (hasValue(dc.PHONE1)) contactInfo['Phone'] = dc.PHONE1;
    printNonEmptyKeyValues(contactInfo);
    
    const addressLines = formatAddress(dc.MAILADDRESS);
    if (addressLines.length > 0) {
      console.log();
      console.log(chalk.gray('  Address:'));
      for (const line of addressLines) {
        console.log(`    ${line}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Dates
  // ═══════════════════════════════════════════════════════════════════════════
  const hasDates = hasValue(customer.LAST_INVOICEDATE) || hasValue(customer.WHENCREATED) || hasValue(customer.WHENMODIFIED);
  if (hasDates) {
    console.log();
    console.log(chalk.bold.cyan('Dates'));
    console.log();
    
    const dateInfo: Record<string, unknown> = {};
    if (hasValue(customer.LAST_INVOICEDATE)) dateInfo['Last Invoice'] = customer.LAST_INVOICEDATE;
    if (hasValue(customer.LAST_STATEMENTDATE)) dateInfo['Last Statement'] = customer.LAST_STATEMENTDATE;
    if (hasValue(customer.WHENCREATED)) dateInfo['Created'] = customer.WHENCREATED;
    if (hasValue(customer.WHENMODIFIED)) dateInfo['Modified'] = customer.WHENMODIFIED;
    printNonEmptyKeyValues(dateInfo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Entity (if multi-entity)
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasValue(customer.MEGAENTITYNAME)) {
    console.log();
    console.log(chalk.bold.cyan('Entity'));
    console.log();
    printNonEmptyKeyValues({
      'Entity': `${customer.MEGAENTITYID} - ${customer.MEGAENTITYNAME}`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Comments
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasValue(customer.COMMENTS) || hasValue(customer.CUSTMESSAGE?.MESSAGE)) {
    console.log();
    console.log(chalk.bold.cyan('Notes'));
    console.log();
    if (hasValue(customer.COMMENTS)) {
      console.log(`  ${customer.COMMENTS}`);
    }
    if (hasValue(customer.CUSTMESSAGE?.MESSAGE)) {
      console.log(`  ${chalk.gray('Message:')} ${customer.CUSTMESSAGE!.MESSAGE}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Footer / Audit
  // ═══════════════════════════════════════════════════════════════════════════
  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  const auditParts = [`Record No: ${customer.RECORDNO || '-'}`];
  if (hasValue(customer.CREATEDBYLOGINID)) auditParts.push(`Created by: ${customer.CREATEDBYLOGINID}`);
  if (hasValue(customer.MODIFIEDBYLOGINID)) auditParts.push(`Modified by: ${customer.MODIFIEDBYLOGINID}`);
  console.log(chalk.gray(auditParts.join(' | ')));
  
  console.log();
  printInfo(`For contact details, use: get customer ${customerId} contact`);
}

async function handleGetCustomerContact(
  client: SageClient,
  customerId: string,
  contactType: string
): Promise<void> {
  printHeader(`Customer Contact Details`);
  
  if (!customerId) {
    printError('Please specify a customer ID');
    return;
  }

  printInfo(`Fetching customer: ${customerId}`);
  const result = await getCustomer(client, customerId);
  
  if (!result.success || !result.customer) {
    printError(result.error || 'Failed to get customer');
    return;
  }

  const customer = result.customer;
  
  console.log();
  console.log(chalk.bold(`Customer ${customer.CUSTOMERID} - ${customer.NAME}`));
  console.log(chalk.gray('─'.repeat(60)));
  
  const validTypes = ['DISPLAYCONTACT', 'BILLTO', 'SHIPTO', 'CONTACTINFO', 'ALL', 'CONTACTS'];
  const upperType = contactType.toUpperCase();
  
  if (!validTypes.includes(upperType)) {
    printError(`Unknown contact type: ${contactType}`);
    console.log();
    printInfo('Available contact types:');
    printInfo('  DISPLAYCONTACT  - Primary display contact');
    printInfo('  BILLTO          - Bill-to contact');
    printInfo('  SHIPTO          - Ship-to contact');
    printInfo('  CONTACTINFO     - Contact information');
    printInfo('  CONTACTS        - All customer entity contacts');
    printInfo('  ALL             - Show all contact sections');
    return;
  }

  // Display the requested contact section(s)
  if (upperType === 'ALL' || upperType === 'DISPLAYCONTACT') {
    displayContactSection('Display Contact', customer.DISPLAYCONTACT);
  }
  
  if (upperType === 'ALL' || upperType === 'BILLTO') {
    displayContactSection('Bill To', customer.BILLTO);
  }
  
  if (upperType === 'ALL' || upperType === 'SHIPTO') {
    displayContactSection('Ship To', customer.SHIPTO);
  }
  
  if (upperType === 'ALL' || upperType === 'CONTACTINFO') {
    displayContactSection('Contact Info', customer.CONTACTINFO);
  }
  
  // Customer Entity Contacts list
  if (upperType === 'ALL' || upperType === 'CONTACTS') {
    const entityContacts = customer.CUSTOMERCONTACTS?.customerentitycontacts;
    if (entityContacts) {
      const contacts = Array.isArray(entityContacts) ? entityContacts : [entityContacts];
      
      if (contacts.length > 0) {
        console.log();
        console.log(chalk.bold.cyan(`Customer Contacts (${contacts.length})`));
        console.log();
        
        for (const contact of contacts) {
          const isPrimary = contact.ISPRIMARY === 'true';
          const isBillTo = contact.ISBILLTOPAYTO === 'true';
          const isShipTo = contact.ISSHIPTORETURNTO === 'true';
          
          const badges: string[] = [];
          if (isPrimary) badges.push(chalk.green('Primary'));
          if (isBillTo) badges.push(chalk.blue('Bill-To'));
          if (isShipTo) badges.push(chalk.yellow('Ship-To'));
          
          const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
          
          console.log(`  ${chalk.bold(contact.CONTACTNAME || contact.CONTACT?.NAME || '-')}${badgeStr}`);
          if (hasValue(contact.CATEGORYNAME)) {
            console.log(`    ${chalk.gray('Category:')} ${contact.CATEGORYNAME}`);
          }
          if (hasValue(contact.RECORDNO)) {
            console.log(`    ${chalk.gray('Record No:')} ${contact.RECORDNO}`);
          }
          console.log();
        }
      }
    }
  }
  
  // If specific type was requested and nothing was found
  if (upperType !== 'ALL' && upperType !== 'CONTACTS') {
    const contactMap: Record<string, CustomerContact | undefined> = {
      'DISPLAYCONTACT': customer.DISPLAYCONTACT,
      'BILLTO': customer.BILLTO,
      'SHIPTO': customer.SHIPTO,
      'CONTACTINFO': customer.CONTACTINFO,
    };
    
    if (!contactMap[upperType]) {
      printInfo(`No ${contactType} information found for this customer`);
    }
  }
}

async function handleGetInvoice(
  client: SageClient, 
  options: { recordNo?: string; invoiceId?: string }
): Promise<void> {
  const identifier = options.invoiceId || options.recordNo;
  printHeader(`Invoice Details`);
  
  if (!identifier) {
    printError('Please specify an invoice ID (e.g., INV25948) or record number');
    return;
  }

  let result: InvoiceResult;
  
  if (options.invoiceId) {
    // First, query by Invoice ID to get the record number
    printInfo(`Looking up Invoice ID: ${options.invoiceId}`);
    const queryResult = await queryInvoiceById(client, options.invoiceId);
    
    if (!queryResult.success || !queryResult.invoice) {
      printError(queryResult.error || `Invoice ${options.invoiceId} not found`);
      return;
    }
    
    // Now fetch the full record details
    const recordNo = queryResult.invoice.RECORDNO;
    printInfo(`Fetching full details for Record No: ${recordNo}`);
    result = await getInvoice(client, recordNo);
  } else {
    printInfo(`Fetching invoice by Record No: ${options.recordNo}`);
    result = await getInvoice(client, options.recordNo!);
  }
  
  if (!result.success) {
    printError(result.error || 'Failed to get invoice');
    return;
  }

  const invoice = result.invoice!;
  
  // Status styling
  const stateColor = invoice.STATE === 'Paid' ? chalk.green :
                     invoice.STATE === 'Posted' ? chalk.blue :
                     invoice.STATE === 'Submitted' ? chalk.yellow :
                     invoice.RAWSTATE === 'D' ? chalk.gray : chalk.white;

  // Calculate amounts
  const amountEntered = Number(invoice.TRX_TOTALENTERED || invoice.TOTALENTERED || 0);
  const amountPaid = Number(invoice.TRX_TOTALPAID || invoice.TOTALPAID || 0);
  const amountDue = Number(invoice.TRX_TOTALDUE || invoice.TOTALDUE || 0);
  const currency = invoice.CURRENCY || invoice.BASECURR || 'USD';

  // Calculate due in days
  // Sage returns DUE_IN_DAYS as negative when due in future, positive when overdue
  let dueInDaysDisplay: string;
  const apiDueInDays = invoice.DUE_IN_DAYS ? parseInt(String(invoice.DUE_IN_DAYS)) : null;
  
  if (apiDueInDays !== null && !isNaN(apiDueInDays)) {
    // API value: negative = due in future, positive = overdue
    if (apiDueInDays < 0) {
      dueInDaysDisplay = `${Math.abs(apiDueInDays)} days`;
    } else if (apiDueInDays === 0) {
      dueInDaysDisplay = 'Today';
    } else {
      dueInDaysDisplay = `${apiDueInDays} days overdue`;
    }
  } else if (invoice.WHENDUE) {
    // Fallback: calculate from due date
    let dueDateParts: number[];
    if (invoice.WHENDUE.includes('/')) {
      const [month, day, year] = invoice.WHENDUE.split('/').map(Number);
      dueDateParts = [year, month - 1, day];
    } else {
      const [year, month, day] = invoice.WHENDUE.split('-').map(Number);
      dueDateParts = [year, month - 1, day];
    }
    
    const dueDate = new Date(dueDateParts[0], dueDateParts[1], dueDateParts[2]);
    const today = new Date();
    const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = dueDateOnly.getTime() - todayOnly.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    dueInDaysDisplay = diffDays > 0 ? `${diffDays} days` : diffDays === 0 ? 'Today' : `${Math.abs(diffDays)} days overdue`;
  } else {
    dueInDaysDisplay = '-';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Header with key metrics (like the UI top bar)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log();
  console.log(chalk.bold(`Invoice -- ${invoice.RECORDID || 'N/A'}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
  
  // Quick stats row (mimics the UI header)
  const statsTable = [
    ['Invoice date', 'Due date', 'Due in', 'Invoice total', 'Amount paid', 'Amount due', 'State'],
    [
      invoice.WHENCREATED || '-',
      invoice.WHENDUE || '-',
      dueInDaysDisplay,
      `${formatCurrency(amountEntered)} ${currency}`,
      `${formatCurrency(amountPaid)} ${currency}`,
      `${formatCurrency(amountDue)} ${currency}`,
      invoice.STATE || invoice.RAWSTATE || '-'
    ]
  ];
  console.log(chalk.gray(statsTable[0].join('  |  ')));
  console.log(statsTable[1].map((v, i) => 
    i === 6 ? stateColor(v) : 
    i === 5 && amountDue > 0 ? chalk.red(v) : 
    i === 4 && amountPaid > 0 ? chalk.green(v) : v
  ).join('  |  '));
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // Transaction Details
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.cyan('Transaction'));
  console.log();
  
  const billTo = invoice.BILLTO || invoice.CONTACT;
  const shipTo = invoice.SHIPTO;
  
  printKeyValues({
    'Date': invoice.WHENCREATED || '-',
    'GL posting date': invoice.WHENPOSTED || '-',
    'Customer': `${invoice.CUSTOMERID}--${invoice.CUSTOMERNAME || ''}`,
    'Bill to': invoice.BILLTOCONTACTNAME || billTo?.CONTACTNAME || '-',
    'Ship to': invoice.SHIPTOCONTACTNAME || shipTo?.CONTACTNAME || '-',
  });

  // Contact details
  if (billTo?.EMAIL1 || billTo?.PHONE1) {
    console.log();
    printKeyValues({
      'Email': billTo?.EMAIL1 || '-',
      'Phone': billTo?.PHONE1 || '-',
    });
  }

  console.log();
  printKeyValues({
    'State': stateColor(invoice.STATE || invoice.RAWSTATE || '-'),
    'Invoice number': chalk.bold(invoice.RECORDID || '-'),
    'Reference number': invoice.DOCNUMBER || '-',
    'Description': invoice.DESCRIPTION || '-',
  });

  if (invoice.DESCRIPTION2) {
    printKeyValues({ 'Message': invoice.DESCRIPTION2 });
  }

  console.log();
  printKeyValues({
    'When modified': invoice.WHENMODIFIED || '-',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Terms & Dates
  // ═══════════════════════════════════════════════════════════════════════════
  console.log();
  console.log(chalk.bold.cyan('Terms & Dates'));
  console.log();
  printKeyValues({
    'Term': invoice.TERMNAME || '-',
    'Due date': invoice.WHENDUE || '-',
    'Paid date': invoice.WHENPAID || '-',
    'Discount date': invoice.WHENDISCOUNT || '-',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration / Custom Fields
  // ═══════════════════════════════════════════════════════════════════════════
  const hasIntegrationFields = invoice.TOKEN_345 || invoice.PAYSTAND_UUID || 
                               invoice.EXTERNALREFNO || invoice.EXTERNALURL || 
                               invoice.SUPDOCID;
  if (hasIntegrationFields) {
    console.log();
    console.log(chalk.bold.cyan('Integration'));
    console.log();
    printKeyValues({
      'Token': invoice.TOKEN_345 || '-',
      'PAYSTAND_UUID': invoice.PAYSTAND_UUID || '-',
      'External Ref': invoice.EXTERNALREFNO || '-',
      'Attachment': invoice.SUPDOCID || '-',
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Line Items
  // ═══════════════════════════════════════════════════════════════════════════
  const lineItems = invoice.ARINVOICEITEMS?.arinvoiceitem;
  if (lineItems) {
    const items = Array.isArray(lineItems) ? lineItems : [lineItems];
    console.log();
    console.log(chalk.bold.cyan(`Line Items (${items.length})`));
    console.log();
    
    const lineColumns = [
      { key: 'LINE_NO', header: '#', width: 4 },
      { key: 'ACCOUNTNO', header: 'GL Account', width: 12, format: formatRaw },
      { key: 'ACCOUNTTITLE', header: 'Account Name', width: 20 },
      { key: 'TRX_AMOUNT', header: 'Amount', width: 12, align: 'right' as const, format: formatCurrency },
      { key: 'ENTRYDESCRIPTION', header: 'Description', width: 25 },
      { key: 'LOCATIONID', header: 'Location', width: 10 },
      { key: 'DEPARTMENTID', header: 'Dept', width: 8 },
    ];
    
    console.log(createTable(items as unknown as Record<string, unknown>[], lineColumns));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Entity (if multi-entity)
  // ═══════════════════════════════════════════════════════════════════════════
  if (invoice.MEGAENTITYNAME) {
    console.log();
    console.log(chalk.bold.cyan('Entity'));
    console.log();
    printKeyValues({
      'Entity': `${invoice.MEGAENTITYID} - ${invoice.MEGAENTITYNAME}`,
      'Batch': invoice.PRBATCH || '-',
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Audit Info
  // ═══════════════════════════════════════════════════════════════════════════
  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.gray(`Record No: ${invoice.RECORDNO} | Created by: ${invoice.CREATEDBYLOGINID || '-'} | Modified by: ${invoice.MODIFIEDBYLOGINID || '-'}`));
}

async function handleCreateInvoice(
  client: SageClient,
  memory: MemoryStore,
  cmd: ParsedCommand
): Promise<void> {
  printHeader(`Creating ${cmd.count || 1} Invoice(s) with Learning`);

  // Get defaults from both memory store and knowledge store
  const defaults = await memory.getDefaults();
  const knowledge = getKnowledgeStore();
  const invoiceKnowledge = await knowledge.getActionKnowledge('invoice');
  
  // Prefer command-line values, then knowledge working defaults, then memory defaults
  const customerId = cmd.customerId || invoiceKnowledge.workingDefaults.customerId || defaults.customerId;
  const glAccountNo = cmd.glAccount || invoiceKnowledge.workingDefaults.glAccountNo || defaults.glAccountNo;
  const amount = cmd.amount || defaults.defaultAmount || 100;
  const currency = invoiceKnowledge.workingDefaults.currency || defaults.currency || 'USD';

  printInfo(`Starting values:`);
  printInfo(`  Customer: ${customerId || chalk.yellow('(will auto-discover)')}`);
  printInfo(`  GL Account: ${glAccountNo || chalk.yellow('(will auto-discover)')}`);
  printInfo(`  Amount: ${formatCurrency(amount)}`);
  printInfo(`  Currency: ${currency}`);
  
  if (invoiceKnowledge.badValues.customerIds.length > 0) {
    printInfo(`  Known bad customers: ${invoiceKnowledge.badValues.customerIds.slice(-3).join(', ')}`);
  }
  if (invoiceKnowledge.badValues.glAccountNos.length > 0) {
    printInfo(`  Known bad GL accounts: ${invoiceKnowledge.badValues.glAccountNos.slice(-3).join(', ')}`);
  }
  console.log();

  const count = cmd.count || 1;
  const createdInvoices: Array<{ recordNo: string; recordId?: string; amount: number; attempts: number }> = [];
  const failures: Array<{ error: string; attempts: number }> = [];

  for (let i = 0; i < count; i++) {
    printInfo(`${chalk.bold(`Invoice ${i + 1} of ${count}`)}`);
    console.log();

    // Use the learning wrapper
    const result = await createInvoiceWithLearning(
      client,
      {
        customerId,
        glAccountNo,
        amount,
        currency,
        description: `Test invoice ${i + 1} created by Sage Agent`,
      },
      (attempt: LearningAttempt) => {
        // Called after each attempt
        if (attempt.success) {
          console.log(chalk.green(`  Attempt ${attempt.attemptNumber}: ✓ Success`));
        } else {
          console.log(chalk.yellow(`  Attempt ${attempt.attemptNumber}: ✗ Failed`));
          console.log(chalk.gray(`    Error: ${describeErrorType(attempt.errorType!)}`));
          if (attempt.recovery) {
            console.log(chalk.blue(`    Recovery: ${attempt.recovery}`));
          }
        }
      }
    );

    console.log();

    if (result.success && result.recordNo) {
      // Fetch the full invoice to get the Invoice ID
      printInfo(`Fetching invoice details...`);
      const invoiceDetails = await getInvoice(client, result.recordNo);
      
      const invoiceId = invoiceDetails.success && invoiceDetails.invoice 
        ? invoiceDetails.invoice.RECORDID 
        : undefined;
      
      printSuccess(`Created invoice: ${invoiceId || 'Record #' + result.recordNo}`);
      
      createdInvoices.push({
        recordNo: result.recordNo,
        recordId: invoiceId,
        amount,
        attempts: result.attempts.length,
      });

      // Also record in the old memory store for backwards compatibility
      const lastAttempt = result.attempts[result.attempts.length - 1];
      await memory.recordSuccess({
        customerId: lastAttempt.input.customerId!,
        glAccountNo: lastAttempt.input.glAccountNo,
      });
    } else if (!result.success) {
      printError(`Failed after ${result.attempts.length} attempts`);
      console.log(chalk.red(result.finalError || 'Unknown error'));
      
      failures.push({ 
        error: result.finalError || 'Unknown error',
        attempts: result.attempts.length,
      });
    }

    console.log();
  }

  // Summary
  printHeader('Summary');
  printInfo(`Created: ${createdInvoices.length}`);
  printInfo(`Failed: ${failures.length}`);

  if (createdInvoices.length > 0) {
    console.log();
    const columns = [
      { key: 'recordNo', header: 'Record #', width: 15, format: formatRaw },
      { key: 'recordId', header: 'Invoice ID', width: 20, format: formatRaw },
      { key: 'amount', header: 'Amount', width: 12, format: formatCurrency },
      { key: 'attempts', header: 'Attempts', width: 10 },
    ];
    console.log(createTable(createdInvoices as unknown as Record<string, unknown>[], columns));
  }

  // Show updated knowledge
  const updatedKnowledge = await knowledge.getActionKnowledge('invoice');
  if (updatedKnowledge.workingDefaults.customerId || updatedKnowledge.workingDefaults.glAccountNo) {
    console.log();
    printInfo(chalk.bold('Learned working defaults:'));
    if (updatedKnowledge.workingDefaults.customerId) {
      printInfo(`  Customer: ${updatedKnowledge.workingDefaults.customerId}`);
    }
    if (updatedKnowledge.workingDefaults.glAccountNo) {
      printInfo(`  GL Account: ${updatedKnowledge.workingDefaults.glAccountNo}`);
    }
    if (updatedKnowledge.workingDefaults.currency) {
      printInfo(`  Currency: ${updatedKnowledge.workingDefaults.currency}`);
    }
  }
}

// =============================================================================
// Payment Handlers
// =============================================================================

async function handleListBankAccounts(client: SageClient): Promise<void> {
  printHeader('Bank Accounts');
  
  const result = await listAllBankAccounts(client, { pageSize: 30 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list bank accounts');
    return;
  }

  if (result.accounts.length === 0) {
    printInfo('No bank accounts found');
    return;
  }

  const columns = [
    { key: 'BANKACCOUNTID', header: 'Account ID', width: 20, format: formatRaw },
    { key: 'BANKNAME', header: 'Bank Name', width: 25 },
    { key: 'DESCRIPTION', header: 'Description', width: 25 },
    { key: 'CURRENCY', header: 'Currency', width: 10 },
    { key: 'STATUS', header: 'Status', width: 10, format: formatStatus },
  ];

  console.log(createTable(result.accounts as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.accounts.length} bank account(s)`);
}

async function handleListPayments(client: SageClient, customerId?: string): Promise<void> {
  printHeader(customerId ? `Payments for Customer ${customerId}` : 'Recent Payments');
  
  const result = await listPayments(client, { customerId, pageSize: 30 });
  
  if (!result.success) {
    printError(result.error || 'Failed to list payments');
    return;
  }

  if (result.payments.length === 0) {
    printInfo('No payments found');
    return;
  }

  const columns = [
    { key: 'RECORDNO', header: 'Record #', width: 12, format: formatRaw },
    { key: 'DOCNUMBER', header: 'Doc #', width: 15, format: formatRaw },
    { key: 'CUSTOMERID', header: 'Customer', width: 15, format: formatRaw },
    { key: 'TRX_TOTALPAID', header: 'Amount', width: 12, align: 'right' as const, format: formatCurrency },
    { key: 'PAYMENTMETHOD', header: 'Method', width: 12 },
    { key: 'RECEIPTDATE', header: 'Date', width: 12 },
    { key: 'STATE', header: 'Status', width: 12, format: formatStatus },
  ];

  console.log(createTable(result.payments as unknown as Record<string, unknown>[], columns));
  printInfo(`Found ${result.payments.length} payment(s)`);
}

async function handleGetPayment(client: SageClient, recordNo: string): Promise<void> {
  printHeader('Payment Details');
  
  if (!recordNo) {
    printError('Please specify a payment record number');
    return;
  }

  printInfo(`Fetching payment: ${recordNo}`);
  const result = await getPayment(client, recordNo);
  
  if (!result.success || !result.payment) {
    printError(result.error || 'Failed to get payment');
    return;
  }

  const payment = result.payment;
  
  // Status styling
  const stateColor = payment.STATE === 'Posted' ? chalk.green :
                     payment.STATE === 'Reversed' ? chalk.red :
                     payment.STATE === 'Submitted' ? chalk.yellow : chalk.white;

  console.log();
  console.log(chalk.bold(`Payment -- ${payment.DOCNUMBER || payment.RECORDNO}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
  
  // Quick stats
  const amount = Number(payment.TRX_TOTALPAID || 0);
  const currency = payment.CURRENCY || 'USD';
  
  printKeyValues({
    'Record No': payment.RECORDNO || '-',
    'Doc Number': payment.DOCNUMBER || '-',
    'Customer': payment.CUSTOMERID || '-',
    'Amount': `${formatCurrency(amount)} ${currency}`,
    'State': stateColor(payment.STATE || '-'),
  });

  console.log();
  console.log(chalk.bold.cyan('Payment Details'));
  console.log();
  
  printKeyValues({
    'Payment Method': payment.PAYMENTMETHOD || '-',
    'Receipt Date': payment.RECEIPTDATE || '-',
    'Payment Date': payment.PAYMENTDATE || '-',
    'Bank Account': payment.FINANCIALENTITY || payment.BANKACCOUNTID || '-',
    'Currency': currency,
  });

  // Payment line items
  const details = payment.ARPYMTDETAILS?.arpymtdetail;
  if (details) {
    const items = Array.isArray(details) ? details : [details];
    console.log();
    console.log(chalk.bold.cyan(`Applied to Invoices (${items.length})`));
    console.log();
    
    const detailColumns = [
      { key: 'RECORDKEY', header: 'Invoice #', width: 15, format: formatRaw },
      { key: 'TRX_PAYMENTAMOUNT', header: 'Amount', width: 15, align: 'right' as const, format: formatCurrency },
      { key: 'ENTRYDESCRIPTION', header: 'Description', width: 30 },
    ];
    
    console.log(createTable(items as unknown as Record<string, unknown>[], detailColumns));
  }

  // Audit info
  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.gray(`Record No: ${payment.RECORDNO || '-'} | Created: ${payment.WHENCREATED || payment.AUWHENCREATED || '-'}`));
}

async function handlePayInvoice(
  client: SageClient,
  cmd: ParsedCommand
): Promise<void> {
  printHeader('Pay Invoice');

  // Need to get the invoice record number
  let invoiceRecordNo: string | undefined = cmd.recordNo;

  // If we have an invoice ID (like INV25948), look it up first
  if (cmd.invoiceId && !invoiceRecordNo) {
    printInfo(`Looking up Invoice ID: ${cmd.invoiceId}`);
    const queryResult = await queryInvoiceById(client, cmd.invoiceId);
    
    if (!queryResult.success || !queryResult.invoice) {
      printError(queryResult.error || `Invoice ${cmd.invoiceId} not found`);
      return;
    }
    
    invoiceRecordNo = queryResult.invoice.RECORDNO;
    printInfo(`Found: Record No ${invoiceRecordNo}`);
  }

  if (!invoiceRecordNo) {
    printError('Please specify an invoice to pay:');
    printInfo('  pay invoice INV25948         (by Invoice ID)');
    printInfo('  pay invoice 54284            (by Record Number)');
    printInfo('  pay invoice INV25948 $100    (partial payment)');
    printInfo('  pay invoice INV25948 amount 50');
    return;
  }

  // Get the invoice details first
  const invoiceResult = await getInvoice(client, invoiceRecordNo);
  if (!invoiceResult.success || !invoiceResult.invoice) {
    printError(invoiceResult.error || 'Failed to fetch invoice');
    return;
  }

  const invoice = invoiceResult.invoice;
  const amountDue = Number(invoice.TRX_TOTALDUE || invoice.TOTALDUE || 0);
  const paymentAmount = cmd.amount !== undefined ? cmd.amount : amountDue;
  const currency = invoice.CURRENCY || 'USD';

  printInfo(`Invoice: ${invoice.RECORDID || invoiceRecordNo}`);
  printInfo(`Customer: ${invoice.CUSTOMERID}`);
  printInfo(`Amount Due: ${formatCurrency(amountDue)} ${currency}`);
  printInfo(`Payment Amount: ${formatCurrency(paymentAmount)} ${currency}`);
  
  if (cmd.paymentMethod) {
    printInfo(`Payment Method: ${cmd.paymentMethod}`);
  }
  if (cmd.bankAccountId) {
    printInfo(`Bank Account: ${cmd.bankAccountId}`);
  }
  console.log();

  if (amountDue <= 0) {
    printError('Invoice has no balance due');
    return;
  }

  if (paymentAmount > amountDue) {
    printInfo(chalk.yellow(`Warning: Amount ${formatCurrency(paymentAmount)} exceeds due ${formatCurrency(amountDue)}. Will pay ${formatCurrency(amountDue)}.`));
  }

  // Use learning wrapper
  const result = await createPaymentWithLearning(
    client,
    {
      invoiceRecordNo,
      amount: paymentAmount,
      paymentMethod: cmd.paymentMethod,
      bankAccountId: cmd.bankAccountId,
      currency,
    },
    (attempt: PaymentLearningAttempt) => {
      if (attempt.success) {
        console.log(chalk.green(`  Attempt ${attempt.attemptNumber}: ✓ Success`));
      } else {
        console.log(chalk.yellow(`  Attempt ${attempt.attemptNumber}: ✗ Failed`));
        console.log(chalk.gray(`    Error: ${describeErrorType(attempt.errorType!)}`));
        if (attempt.recovery) {
          console.log(chalk.blue(`    Recovery: ${attempt.recovery}`));
        }
      }
    }
  );

  console.log();

  if (result.success) {
    printSuccess(`Payment created successfully!`);
    printKeyValues({
      'Payment Record': result.recordNo || '-',
      'Invoice': result.invoiceId || invoiceRecordNo,
      'Amount Paid': formatCurrency(result.amountPaid || paymentAmount),
      'Attempts': result.attempts.length,
    });

    // Show the updated invoice state
    console.log();
    printInfo('Verifying invoice status...');
    const updatedInvoice = await getInvoice(client, invoiceRecordNo);
    if (updatedInvoice.success && updatedInvoice.invoice) {
      const newAmountDue = Number(updatedInvoice.invoice.TRX_TOTALDUE || updatedInvoice.invoice.TOTALDUE || 0);
      const newState = updatedInvoice.invoice.STATE;
      
      const stateColor = newState === 'Paid' ? chalk.green :
                        newState === 'Partially Paid' ? chalk.yellow : chalk.white;
      
      printKeyValues({
        'Invoice State': stateColor(newState || '-'),
        'Remaining Due': formatCurrency(newAmountDue),
      });
    }

    // Show learned defaults
    const knowledge = getKnowledgeStore();
    const paymentKnowledge = await knowledge.getPaymentKnowledge();
    if (paymentKnowledge.workingDefaults.bankAccountId) {
      console.log();
      printInfo(chalk.bold('Learned payment defaults:'));
      printInfo(`  Bank Account: ${paymentKnowledge.workingDefaults.bankAccountId}`);
      if (paymentKnowledge.workingDefaults.paymentMethod) {
        printInfo(`  Payment Method: ${paymentKnowledge.workingDefaults.paymentMethod}`);
      }
    }
  } else {
    printError(`Payment failed after ${result.attempts.length} attempts`);
    console.log(chalk.red(result.finalError || 'Unknown error'));
  }
}

async function handleShowDefaults(memory: MemoryStore): Promise<void> {
  printHeader('Current Defaults & Learned Knowledge');
  
  const defaults = await memory.getDefaults();
  const knowledge = getKnowledgeStore();
  const invoiceKnowledge = await knowledge.getActionKnowledge('invoice');

  console.log(chalk.bold('📋 Manual Defaults (from data/defaults.json):'));
  printKeyValues({
    'Customer ID': defaults.customerId || chalk.gray('(not set)'),
    'GL Account': defaults.glAccountNo || chalk.gray('(not set)'),
    'Account Label': defaults.accountLabel || chalk.gray('(not set)'),
    'Location ID': defaults.locationId || chalk.gray('(not set)'),
    'Currency': defaults.currency || chalk.gray('(not set)'),
    'Default Amount': defaults.defaultAmount ? formatCurrency(defaults.defaultAmount) : chalk.gray('(not set)'),
  });

  console.log();
  console.log(chalk.bold('Learned Working Defaults (from successful invoices):'));
  const learned = invoiceKnowledge.workingDefaults;
  if (Object.values(learned).every(v => !v)) {
    printInfo('No working defaults learned yet');
  } else {
    printKeyValues({
      'Customer ID': learned.customerId || chalk.gray('(not learned)'),
      'GL Account': learned.glAccountNo?.toString() || chalk.gray('(not learned)'),
      'Currency': learned.currency || chalk.gray('(not learned)'),
      'Location ID': learned.locationId?.toString() || chalk.gray('(not learned)'),
      'Department ID': learned.departmentId?.toString() || chalk.gray('(not learned)'),
    });
  }

  console.log();
  console.log(chalk.bold(' Known Bad Values (will be avoided):'));
  const bad = invoiceKnowledge.badValues;
  const hasBadValues = bad.customerIds.length > 0 || bad.glAccountNos.length > 0 || 
                       bad.locationIds.length > 0 || bad.departmentIds.length > 0;
  if (!hasBadValues) {
    printInfo('No bad values recorded yet');
  } else {
    if (bad.customerIds.length > 0) {
      console.log(`  ${chalk.red('Customers:')} ${bad.customerIds.join(', ')}`);
    }
    if (bad.glAccountNos.length > 0) {
      console.log(`  ${chalk.red('GL Accounts:')} ${bad.glAccountNos.join(', ')}`);
    }
    if (bad.locationIds.length > 0) {
      console.log(`  ${chalk.red('Locations:')} ${bad.locationIds.join(', ')}`);
    }
    if (bad.departmentIds.length > 0) {
      console.log(`  ${chalk.red('Departments:')} ${bad.departmentIds.join(', ')}`);
    }
  }

  console.log();
  console.log(chalk.bold('Successful Invoice Combinations:'));
  if (invoiceKnowledge.successfulCombos.length === 0) {
    printInfo('No successful combinations recorded yet');
  } else {
    for (const combo of invoiceKnowledge.successfulCombos.slice(-5)) {
      const parts = [];
      if (combo.customerId) parts.push(`Customer: ${combo.customerId}`);
      if (combo.glAccountNo) parts.push(`GL: ${combo.glAccountNo}`);
      if (combo.departmentId) parts.push(`Dept: ${combo.departmentId}`);
      if (combo.locationId) parts.push(`Loc: ${combo.locationId}`);
      const dateStr = new Date(combo.createdAt).toLocaleDateString();
      console.log(`  ${chalk.green('✓')} ${parts.join(', ')} (${dateStr})`);
    }
  }

  // Payment Knowledge
  const paymentKnowledge = await knowledge.getPaymentKnowledge();
  
  console.log();
  console.log(chalk.bold.blue('═══ Payment Knowledge ═══'));
  
  console.log();
  console.log(chalk.bold('Learned Payment Defaults:'));
  const paymentDefaults = paymentKnowledge.workingDefaults;
  if (!paymentDefaults.bankAccountId && !paymentDefaults.paymentMethod) {
    printInfo('No payment defaults learned yet');
  } else {
    printKeyValues({
      'Bank Account': paymentDefaults.bankAccountId || chalk.gray('(not learned)'),
      'Payment Method': paymentDefaults.paymentMethod || chalk.gray('(not learned)'),
      'Currency': paymentDefaults.currency || chalk.gray('(not learned)'),
    });
  }

  console.log();
  console.log(chalk.bold('Known Bad Payment Values:'));
  const paymentBad = paymentKnowledge.badValues;
  const hasPaymentBadValues = paymentBad.bankAccountIds.length > 0 || paymentBad.paymentMethods.length > 0;
  if (!hasPaymentBadValues) {
    printInfo('No bad payment values recorded yet');
  } else {
    if (paymentBad.bankAccountIds.length > 0) {
      console.log(`  ${chalk.red('Bank Accounts:')} ${paymentBad.bankAccountIds.join(', ')}`);
    }
    if (paymentBad.paymentMethods.length > 0) {
      console.log(`  ${chalk.red('Payment Methods:')} ${paymentBad.paymentMethods.join(', ')}`);
    }
  }

  console.log();
  console.log(chalk.bold('Successful Payment Combinations:'));
  if (paymentKnowledge.successfulCombos.length === 0) {
    printInfo('No successful payments recorded yet');
  } else {
    for (const combo of paymentKnowledge.successfulCombos.slice(-5)) {
      const parts = [];
      if (combo.customerId) parts.push(`Customer: ${combo.customerId}`);
      if (combo.bankAccountId) parts.push(`Bank: ${combo.bankAccountId}`);
      if (combo.paymentMethod) parts.push(`Method: ${combo.paymentMethod}`);
      const dateStr = new Date(combo.createdAt).toLocaleDateString();
      console.log(`  ${chalk.green('✓')} ${parts.join(', ')} (${dateStr})`);
    }
  }
}

async function handleSetDefault(memory: MemoryStore, options: Record<string, string>): Promise<void> {
  printHeader('Setting Defaults');

  const updates: Record<string, unknown> = {};
  
  if (options.customerId) {
    updates.customerId = options.customerId;
    printSuccess(`Default customer set to: ${options.customerId}`);
  }
  if (options.glAccountNo) {
    updates.glAccountNo = options.glAccountNo;
    printSuccess(`Default GL account set to: ${options.glAccountNo}`);
  }
  if (options.defaultAmount) {
    updates.defaultAmount = parseFloat(options.defaultAmount);
    printSuccess(`Default amount set to: ${formatCurrency(updates.defaultAmount)}`);
  }

  if (Object.keys(updates).length === 0) {
    printError('No defaults specified to set');
    return;
  }

  await memory.setDefaults(updates);
  printSuccess('Defaults saved');
}

async function handleResetKnowledge(): Promise<void> {
  printHeader('Resetting Learned Knowledge');

  const knowledge = getKnowledgeStore();
  await knowledge.clear();
  
  printSuccess('Knowledge has been reset!');
  printInfo('The agent will now start fresh and re-learn working combinations.');
  printInfo('Run "create invoice" to begin the learning process.');
}

function handleStatus(client: SageClient): void {
  printHeader('Agent Status');
  
  const sessionInfo = client.getSessionInfo();
  
  printKeyValues({
    'Session Active': sessionInfo.hasSession ? chalk.green('Yes') : chalk.red('No'),
    'Session Age': sessionInfo.sessionAge ? `${sessionInfo.sessionAge} seconds` : '-',
    'Endpoint': sessionInfo.endpoint || '-',
  });
}

function showHelp(): void {
  printHeader('Sage Intacct Action Agent - Commands');

  console.log(chalk.bold('Session:'));
  console.log('  session, connect, login      Create a new API session');
  console.log('  status                       Show current session status');
  console.log();

  console.log(chalk.bold('List Records:'));
  console.log('  list customers               List all active customers');
  console.log('  list invoices                List open invoices');
  console.log('  list payments                List recent payments');
  console.log('  list payments for customer X Filter payments by customer');
  console.log('  list adjustments             List AR adjustments');
  console.log('  list adjustments for cust X  Filter adjustments by customer');
  console.log('  list accounts                List GL accounts');
  console.log('  list labels                  List account labels');
  console.log('  list bank accounts           List available bank accounts');
  console.log();

  console.log(chalk.bold('Get Specific Records:'));
  console.log('  get invoice INV25948         Get invoice by Invoice ID');
  console.log('  get invoice 54284            Get invoice by record number');
  console.log('  get invoices INV1, INV2      Get multiple invoices (summary)');
  console.log('  get invoices for customer X  List all invoices for customer');
  console.log('  get customer 10014           Get customer details by ID');
  console.log('  get customer "Acme Corp"     Search customer by name');
  console.log('  get customer 10014 contact   View all contact sections');
  console.log('  get payment 12345            Get payment by record number');
  console.log('  get adjustment ADJ-001       Get AR adjustment by ID');
  console.log();

  console.log(chalk.bold('Pay Invoices:'));
  console.log('  pay invoice INV25948         Pay invoice in full');
  console.log('  pay invoice 54284            Pay by record number');
  console.log('  pay invoice INV25948 $100    Partial payment');
  console.log('  pay invoice INV25948 amount 50');
  console.log('  pay invoice INV25948 method Cash');
  console.log('  pay invoice INV25948 bank BOA');
  console.log();

  console.log(chalk.bold('Create Invoices:'));
  console.log('  create invoice               Create 1 invoice with defaults');
  console.log('  create 5 invoices            Create multiple invoices');
  console.log('  create invoice for customer CUST-001');
  console.log('  create invoice customer CUST-001 gl account 4000 $100');
  console.log();

  console.log(chalk.bold('AR Adjustments:'));
  console.log('  list adjustments             List all AR adjustments');
  console.log('  list adjustments for customer X');
  console.log('  get adjustment ADJ-001       Get adjustment by ID');
  console.log('  get adjustment 12345         Get adjustment by record number');
  console.log('  create adjustment for customer X');
  console.log('  create 5 adjustments for customer X');
  console.log('  create adjustment customer X amount 100 gl account 60600');
  console.log('  create adjustment customer X invoice INV12345');
  console.log();

  console.log(chalk.bold('Credit Memos (negative AR adjustments):'));
  console.log('  get creditmemos for customer X    List credit memos (RECORDTYPE=ra)');
  console.log('  get creditmemos customer X paid   Filter by status: paid');
  console.log('  get creditmemos customer X posted Filter by status: posted');
  console.log('  get creditmemos customer X status submitted');
  console.log('  create creditmemo for customer X');
  console.log('  create 5 creditmemos for customer X');
  console.log('  create creditmemo customer X amount 25 gl account 12100');
  console.log();

  console.log(chalk.bold('Defaults & Learning:'));
  console.log('  show defaults                Show current defaults and learned knowledge');
  console.log('  set default customer X       Set default customer ID');
  console.log('  set default account 4000     Set default GL account');
  console.log('  set default amount 100       Set default invoice amount');
  console.log('  reset knowledge              Clear all learned knowledge (start fresh)');
  console.log();

  console.log(chalk.bold('Examples:'));
  console.log(chalk.gray('  npm run agent "session"'));
  console.log(chalk.gray('  npm run agent "list customers"'));
  console.log(chalk.gray('  npm run agent "get customer \\"Acme Corp\\""'));
  console.log(chalk.gray('  npm run agent "get invoices for customer 28008"'));
  console.log(chalk.gray('  npm run agent "get invoices INV001, INV002, INV003"'));
  console.log(chalk.gray('  npm run agent "create 3 invoices for customer 28008 amount 858.6"'));
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = args.join(' ').trim();

  console.log();
  console.log(chalk.bold.blue('ᯓ★ Sage Intacct Action Agent'));
  console.log(chalk.gray('─'.repeat(40)));

  if (!input) {
    showHelp();
    return;
  }

  // Parse command
  const cmd = parseCommand(input);
  
  if (cmd.action === 'help') {
    showHelp();
    return;
  }

  // Initialize memory store
  const memory = getMemoryStore();

  // Handle commands that don't need Sage connection
  if (cmd.action === 'show-defaults') {
    await handleShowDefaults(memory);
    return;
  }

  if (cmd.action === 'set-default') {
    await handleSetDefault(memory, cmd.options);
    return;
  }

  if (cmd.action === 'reset-knowledge') {
    await handleResetKnowledge();
    return;
  }

  // Create Sage client
  let client: SageClient;
  try {
    client = createClientFromEnv(true);
  } catch (error) {
    printError(`Configuration error: ${error instanceof Error ? error.message : error}`);
    console.log();
    printInfo('Make sure you have a .env file with the required Sage Intacct credentials.');
    printInfo('See .env.example for the required variables.');
    return;
  }

  // Handle Sage commands
  switch (cmd.action) {
    case 'session':
      await handleSession(client);
      break;

    case 'status':
      handleStatus(client);
      break;

    case 'list-invoices':
      await handleListInvoices(client);
      break;

    case 'list-customers':
      await handleListCustomers(client);
      break;

    case 'list-accounts':
      await handleListAccounts(client);
      break;

    case 'list-labels':
      await handleListLabels(client);
      break;

    case 'get-invoice':
      if (!cmd.recordNo && !cmd.invoiceId) {
        printError('Please specify an invoice ID or record number:');
        printInfo('  get invoice INV25948    (by Invoice ID)');
        printInfo('  get invoice 54284       (by Record Number)');
        return;
      }
      await handleGetInvoice(client, { recordNo: cmd.recordNo, invoiceId: cmd.invoiceId });
      break;

    case 'get-customer':
      if (!cmd.customerId) {
        printError('Please specify a customer ID:');
        printInfo('  get customer 10014       (by Customer ID)');
        printInfo('  get customer CUST-001    (by Customer ID)');
        return;
      }
      await handleGetCustomer(client, cmd.customerId);
      break;

    case 'get-customer-contact':
      if (!cmd.customerId) {
        printError('Please specify a customer ID:');
        printInfo('  get customer 10014 contact              (all contacts)');
        printInfo('  get customer 10014 contact DISPLAYCONTACT');
        printInfo('  get customer 10014 contact BILLTO');
        printInfo('  get customer 10014 contact SHIPTO');
        return;
      }
      await handleGetCustomerContact(client, cmd.customerId, cmd.contactType || 'ALL');
      break;

    case 'search-customer':
      if (!cmd.customerName) {
        printError('Please specify a customer name to search:');
        printInfo('  get customer "Acme Corp"');
        printInfo('  get customer Smith');
        return;
      }
      await handleSearchCustomer(client, cmd.customerName);
      break;

    case 'get-invoices-for-customer':
      if (!cmd.customerId) {
        printError('Please specify a customer ID:');
        printInfo('  get invoices for customer 10014');
        return;
      }
      await handleGetInvoicesForCustomer(client, cmd.customerId);
      break;

    case 'get-invoices-multiple':
      if (!cmd.invoiceIds || cmd.invoiceIds.length === 0) {
        printError('Please specify invoice IDs:');
        printInfo('  get invoices INV001, INV002, INV003');
        return;
      }
      await handleGetMultipleInvoices(client, cmd.invoiceIds);
      break;

    case 'create-invoice':
      await handleCreateInvoice(client, memory, cmd);
      break;

    case 'list-bank-accounts':
      await handleListBankAccounts(client);
      break;

    case 'list-payments':
      await handleListPayments(client, cmd.customerId);
      break;

    case 'get-payment':
      if (!cmd.paymentRecordNo) {
        printError('Please specify a payment record number:');
        printInfo('  get payment 12345');
        return;
      }
      await handleGetPayment(client, cmd.paymentRecordNo);
      break;

    case 'pay-invoice':
      await handlePayInvoice(client, cmd);
      break;

    case 'list-adjustments':
      await handleListAdjustments(client, cmd.customerId);
      break;

    case 'get-adjustment':
      if (!cmd.adjustmentRecordNo && !cmd.adjustmentId) {
        printError('Please specify an adjustment ID or record number:');
        printInfo('  get adjustment ADJ-001    (by Adjustment ID)');
        printInfo('  get adjustment 12345      (by Record Number)');
        return;
      }
      await handleGetAdjustment(client, { 
        recordNo: cmd.adjustmentRecordNo, 
        adjustmentId: cmd.adjustmentId 
      });
      break;

    case 'create-adjustment':
      await handleCreateAdjustment(client, memory, cmd);
      break;

    case 'list-creditmemos':
      if (!cmd.customerId) {
        printError('Customer ID is required for listing credit memos');
        printInfo('Usage: get creditmemos for customer CUST-001');
        printInfo('       get creditmemos for customer CUST-001 status paid');
        printInfo('       get creditmemos for customer CUST-001 posted');
        return;
      }
      await handleListCreditMemos(client, cmd.customerId, cmd.state);
      break;

    case 'create-creditmemo':
      await handleCreateCreditMemo(client, memory, cmd);
      break;

    default:
      printError(`Unknown command: "${input}"`);
      console.log();
      printInfo('Type "help" to see available commands');
  }

  console.log();
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
