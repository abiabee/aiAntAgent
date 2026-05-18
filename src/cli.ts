#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { createClientFromEnv, SageClient } from './sage/client.js';
import { 
  getInvoice, 
  queryInvoiceById, 
  listOpenInvoices, 
  createInvoice,
  Invoice 
} from './sage/actions/invoice.js';
import { listCustomers, getCustomer, Customer } from './sage/actions/listCustomers.js';
import { listGlAccounts, listAccountLabels, GlAccount, AccountLabel } from './sage/actions/listGlAccounts.js';
import { getMemoryStore, MemoryStore } from './memory/store.js';
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
  formatCurrency
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
      // Extract record number
      const match = lower.match(/(?:invoice|#|recordno|record)\s*(\d+)/i);
      if (match) {
        command.recordNo = match[1];
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
    const amountMatch = lower.match(/\$?([\d.]+)(?:\s*dollars?)?|amount\s+([\d.]+)/i);
    if (amountMatch) {
      command.amount = parseFloat(amountMatch[1] || amountMatch[2]);
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

async function handleGetInvoice(client: SageClient, recordNo: string): Promise<void> {
  printHeader(`Invoice #${recordNo}`);
  
  const result = await getInvoice(client, recordNo);
  
  if (!result.success) {
    printError(result.error || 'Failed to get invoice');
    return;
  }

  const invoice = result.invoice!;
  printSuccess('Invoice found');
  printKeyValues({
    'Record No': invoice.RECORDNO,
    'Invoice ID': invoice.RECORDID,
    'Customer': `${invoice.CUSTOMERID} (${invoice.CUSTOMERNAME || 'N/A'})`,
    'Amount': formatCurrency(invoice.TRX_TOTALENTERED),
    'Paid': formatCurrency(invoice.TRX_TOTALPAID),
    'Due': formatCurrency(invoice.TRX_TOTALDUE),
    'Status': invoice.STATE,
    'Created': invoice.WHENCREATED,
    'Due Date': invoice.WHENDUE,
    'Description': invoice.DESCRIPTION || '-',
    'Currency': invoice.CURRENCY || 'USD',
  });
}

async function handleCreateInvoice(
  client: SageClient,
  memory: MemoryStore,
  cmd: ParsedCommand
): Promise<void> {
  printHeader(`Creating ${cmd.count || 1} Invoice(s)`);

  // Get defaults
  const defaults = await memory.getDefaults();
  
  const customerId = cmd.customerId || defaults.customerId;
  const glAccountNo = cmd.glAccount || defaults.glAccountNo;
  const amount = cmd.amount || defaults.defaultAmount || 100;

  if (!customerId) {
    printError('No customer ID specified. Use "create invoice for customer CUST-001" or "set default customer CUST-001"');
    return;
  }

  if (!glAccountNo) {
    printError('No GL account specified. Use "create invoice gl account 4000" or "set default account 4000"');
    return;
  }

  printInfo(`Customer: ${customerId}`);
  printInfo(`GL Account: ${glAccountNo}`);
  printInfo(`Amount: ${formatCurrency(amount)}`);
  console.log();

  const count = cmd.count || 1;
  const createdInvoices: Array<{ recordNo: string; recordId?: string; amount: number }> = [];
  const failures: Array<{ error: string }> = [];

  for (let i = 0; i < count; i++) {
    printInfo(`Creating invoice ${i + 1} of ${count}...`);

    const result = await createInvoice(client, {
      customerId,
      lineItems: [{
        glAccountNo,
        amount,
        memo: `Invoice created by Sage Agent`,
      }],
      description: `Test invoice ${i + 1} created by Sage Agent`,
    });

    if (result.success) {
      printSuccess(`Created invoice: Record #${result.recordNo}`);
      createdInvoices.push({
        recordNo: result.recordNo || 'unknown',
        recordId: result.recordId,
        amount,
      });

      // Record successful combination
      await memory.recordSuccess({
        customerId,
        glAccountNo,
      });
    } else {
      printError(`Failed: ${result.error}`);
      failures.push({ error: result.error || 'Unknown error' });

      // Record failed combination
      await memory.recordFailure({ customerId, glAccountNo }, result.error || 'Unknown error');
    }
  }

  // Summary
  console.log();
  printHeader('Summary');
  printInfo(`Created: ${createdInvoices.length}`);
  printInfo(`Failed: ${failures.length}`);

  if (createdInvoices.length > 0) {
    console.log();
    const columns = [
      { key: 'recordNo', header: 'Record #', width: 15 },
      { key: 'recordId', header: 'Invoice ID', width: 20 },
      { key: 'amount', header: 'Amount', width: 12, format: formatCurrency },
    ];
    console.log(createTable(createdInvoices as unknown as Record<string, unknown>[], columns));
  }
}

async function handleShowDefaults(memory: MemoryStore): Promise<void> {
  printHeader('Current Defaults & Memory');
  
  const defaults = await memory.getDefaults();
  const memoryState = await memory.getMemory();

  console.log(chalk.bold('Defaults:'));
  printKeyValues({
    'Customer ID': defaults.customerId || chalk.gray('(not set)'),
    'GL Account': defaults.glAccountNo || chalk.gray('(not set)'),
    'Account Label': defaults.accountLabel || chalk.gray('(not set)'),
    'Location ID': defaults.locationId || chalk.gray('(not set)'),
    'Currency': defaults.currency || chalk.gray('(not set)'),
    'Default Amount': defaults.defaultAmount ? formatCurrency(defaults.defaultAmount) : chalk.gray('(not set)'),
  });

  console.log();
  console.log(chalk.bold('Learned Combinations:'));
  if (memoryState.workingCombos.length === 0) {
    printInfo('No successful combinations learned yet');
  } else {
    for (const combo of memoryState.workingCombos.slice(0, 5)) {
      console.log(`  ${chalk.green('✓')} Customer: ${combo.customerId}, GL: ${combo.glAccountNo || combo.accountLabel || '-'} (${combo.successCount} successes)`);
    }
  }

  console.log();
  console.log(chalk.bold('Recent Failures:'));
  if (memoryState.failedCombos.length === 0) {
    printInfo('No failures recorded');
  } else {
    for (const fail of memoryState.failedCombos.slice(-3)) {
      console.log(`  ${chalk.red('✗')} Customer: ${fail.combo.customerId}, Error: ${fail.error.substring(0, 50)}...`);
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
  console.log('  get invoice 12345            Get invoice by record number');
  console.log('  get customer CUST-001        Get customer by ID');
  console.log();

  console.log(chalk.bold('Create Invoices:'));
  console.log('  create invoice               Create 1 invoice with defaults');
  console.log('  create 5 invoices            Create multiple invoices');
  console.log('  create invoice for customer CUST-001');
  console.log('  create invoice customer CUST-001 gl account 4000 $100');
  console.log();

  console.log(chalk.bold('Defaults & Memory:'));
  console.log('  show defaults                Show current defaults and learned combos');
  console.log('  set default customer X       Set default customer ID');
  console.log('  set default account 4000     Set default GL account');
  console.log('  set default amount 100       Set default invoice amount');
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
  console.log(chalk.bold.blue('🔧 Sage Intacct Action Agent'));
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
      if (!cmd.recordNo) {
        printError('Please specify an invoice record number: get invoice 12345');
        return;
      }
      await handleGetInvoice(client, cmd.recordNo);
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
