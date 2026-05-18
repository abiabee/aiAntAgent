import Table from 'cli-table3';
import chalk from 'chalk';

export interface TableColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: (value: unknown) => string;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown, format?: (v: unknown) => string): string {
  if (format) {
    return format(value);
  }
  
  if (value === null || value === undefined) {
    return chalk.gray('-');
  }
  
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  
  return String(value);
}

/**
 * Create a formatted table from data
 */
export function createTable<T extends object>(
  data: T[],
  columns: TableColumn[]
): string {
  const table = new Table({
    head: columns.map(col => chalk.cyan.bold(col.header)),
    colWidths: columns.map(col => col.width).filter((w): w is number => w !== undefined),
    colAligns: columns.map(col => col.align || 'left'),
    style: {
      head: [],
      border: [],
    },
  });

  for (const row of data) {
    const rowData = columns.map(col => formatValue((row as Record<string, unknown>)[col.key], col.format));
    table.push(rowData);
  }

  return table.toString();
}

/**
 * Format currency value
 */
export function formatCurrency(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.gray('-');
  }
  const num = Number(value);
  if (isNaN(num)) {
    return String(value);
  }
  return chalk.green(`$${num.toFixed(2)}`);
}

/**
 * Format status with color
 */
export function formatStatus(value: unknown): string {
  const status = String(value || '');
  switch (status.toLowerCase()) {
    case 'posted':
    case 'active':
    case 'success':
      return chalk.green(status);
    case 'partially paid':
    case 'pending':
      return chalk.yellow(status);
    case 'paid':
    case 'completed':
      return chalk.blue(status);
    case 'failed':
    case 'error':
    case 'reversed':
      return chalk.red(status);
    default:
      return status;
  }
}

/**
 * Format date
 */
export function formatDate(value: unknown): string {
  if (!value) return chalk.gray('-');
  return String(value);
}

/**
 * Invoice table columns
 */
export const invoiceColumns: TableColumn[] = [
  { key: 'RECORDNO', header: 'Record #', width: 12 },
  { key: 'RECORDID', header: 'Invoice ID', width: 15 },
  { key: 'CUSTOMERID', header: 'Customer', width: 15 },
  { key: 'TRX_TOTALENTERED', header: 'Amount', width: 12, align: 'right', format: formatCurrency },
  { key: 'TRX_TOTALDUE', header: 'Due', width: 12, align: 'right', format: formatCurrency },
  { key: 'STATE', header: 'Status', width: 15, format: formatStatus },
  { key: 'WHENDUE', header: 'Due Date', width: 12, format: formatDate },
];

/**
 * Customer table columns
 */
export const customerColumns: TableColumn[] = [
  { key: 'CUSTOMERID', header: 'Customer ID', width: 15 },
  { key: 'NAME', header: 'Name', width: 30 },
  { key: 'STATUS', header: 'Status', width: 12, format: formatStatus },
  { key: 'TERMNAME', header: 'Terms', width: 15 },
];

/**
 * GL Account table columns
 */
export const glAccountColumns: TableColumn[] = [
  { key: 'ACCOUNTNO', header: 'Account #', width: 15 },
  { key: 'TITLE', header: 'Title', width: 35 },
  { key: 'ACCOUNTTYPE', header: 'Type', width: 18 },
  { key: 'NORMALBALANCE', header: 'Balance', width: 10 },
  { key: 'STATUS', header: 'Status', width: 10, format: formatStatus },
];

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('✓ ') + message);
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.log(chalk.red('✗ ') + message);
}

/**
 * Print an info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ ') + message);
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠ ') + message);
}

/**
 * Print a header
 */
export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

/**
 * Print key-value pairs
 */
export function printKeyValues(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    console.log(`  ${chalk.gray(key + ':')} ${formatValue(value)}`);
  }
}
