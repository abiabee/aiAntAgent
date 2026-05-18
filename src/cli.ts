#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { createClientFromEnv, SageClient } from './sage/client.js';
import { 
  getInvoice, 
  queryInvoiceById, 
  listOpenInvoices, 
  Invoice,
  InvoiceResult
} from './sage/actions/invoice.js';
import { listCustomers, getCustomer, Customer } from './sage/actions/listCustomers.js';
import { listGlAccounts, listAccountLabels, GlAccount, AccountLabel } from './sage/actions/listGlAccounts.js';
import { getMemoryStore, MemoryStore } from './memory/store.js';
import { formatSageErrors } from './sage/parser.js';
import { createInvoiceWithLearning, LearningAttempt } from './sage/learningInvoice.js';
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
  formatRaw
} from './output/table.js';

// =============================================================================
// Command Parser
// =============================================================================

interface ParsedCommand {
  action: string;
  target?: string;
  count?: number;
  customerId?: string;
  amount?: number;
  glAccount?: string;
  recordNo?: string;
  invoiceId?: string;  // e.g., INV25948
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
  if (lower.includes('list') || lower.includes('show')) {
    if (lower.includes('customer')) {
      command.action = 'list-customers';
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
    } else if (lower.includes('customer')) {
      command.action = 'get-customer';
      // Extract customer ID
      const match = lower.match(/customer\s+([A-Za-z0-9_-]+)/i);
      if (match) {
        command.customerId = match[1];
      }
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

    // Extract amount: "$100" or "100 dollars" or "amount 100"
    // Must have $ prefix or "dollars" suffix or "amount" prefix to distinguish from count
    const amountMatch = lower.match(/\$([\d.]+)|(\d+\.?\d*)\s*dollars?|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2] || amountMatch[3]);
    }

    // Extract GL account
    const glMatch = input.match(/(?:gl|account)\s*#?\s*([A-Za-z0-9_-]+)/i);
    if (glMatch) {
      command.glAccount = glMatch[1];
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
  console.log('  list accounts                List GL accounts');
  console.log('  list labels                  List account labels');
  console.log();

  console.log(chalk.bold('Get Specific Records:'));
  console.log('  get invoice INV25948         Get invoice by Invoice ID');
  console.log('  get invoice 54284            Get invoice by record number');
  console.log('  get customer CUST-001        Get customer by ID');
  console.log();

  console.log(chalk.bold('Create Invoices:'));
  console.log('  create invoice               Create 1 invoice with defaults');
  console.log('  create 5 invoices            Create multiple invoices');
  console.log('  create invoice for customer CUST-001');
  console.log('  create invoice customer CUST-001 gl account 4000 $100');
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
  console.log(chalk.gray('  npm run agent "create invoice for customer TEST-001 gl 4000 $250"'));
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

    case 'create-invoice':
      await handleCreateInvoice(client, memory, cmd);
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
