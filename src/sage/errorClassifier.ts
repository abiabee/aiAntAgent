/**
 * Sage Error Classifier
 * Classifies Sage Intacct errors to determine recovery strategy
 */

export type SageErrorType =
  | 'INVALID_CUSTOMER'
  | 'MISSING_CURRENCY'
  | 'MISSING_BASE_CURRENCY'
  | 'BANK_ACCOUNT_USED_AS_GL'
  | 'INVALID_GL_ACCOUNT'
  | 'GL_REQUIRES_DEPARTMENT'
  | 'GL_REQUIRES_LOCATION'
  | 'INVALID_LOCATION'
  | 'INVALID_DEPARTMENT'
  | 'PERMISSION_DENIED'
  | 'DUPLICATE_RECORD'
  | 'REQUIRED_FIELD_MISSING'
  | 'UNKNOWN';

export interface ClassifiedError {
  type: SageErrorType;
  extractedValue?: string;  // e.g., the invalid customer ID or GL account
  originalMessage: string;
  recoverable: boolean;
}

/**
 * Classify a Sage error message to determine recovery strategy
 */
export function classifySageError(message: string): ClassifiedError {
  const lower = message.toLowerCase();

  // Invalid customer
  if (lower.includes('customer') && (lower.includes('invalid') || lower.includes('not found') || lower.includes('does not exist'))) {
    const match = message.match(/customer\s*['"]?([^'"]+)['"]?\s*is invalid/i) ||
                  message.match(/customer\s*['"]?([^'"]+)['"]?/i);
    return {
      type: 'INVALID_CUSTOMER',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // Missing base currency
  if (lower.includes('base currency') || lower.includes('basecurr')) {
    return {
      type: 'MISSING_BASE_CURRENCY',
      originalMessage: message,
      recoverable: true,
    };
  }

  // Missing currency
  if (lower.includes('currency') && (lower.includes('enter') || lower.includes('missing') || lower.includes('required'))) {
    return {
      type: 'MISSING_CURRENCY',
      originalMessage: message,
      recoverable: true,
    };
  }

  // GL account is a bank account
  if (lower.includes('associated to the bank account') || (lower.includes('bank account') && !lower.includes('requires'))) {
    const match = message.match(/account\s*(?:number\s*)?['"]?(\d+)['"]?/i);
    return {
      type: 'BANK_ACCOUNT_USED_AS_GL',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // GL account requires Department
  if (lower.includes('requires a department') || lower.includes('requires department')) {
    const match = message.match(/account\s*(?:number\s*)?['"]?(\d+)['"]?/i);
    return {
      type: 'GL_REQUIRES_DEPARTMENT',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // GL account requires Location
  if (lower.includes('requires a location') || lower.includes('requires location')) {
    const match = message.match(/account\s*(?:number\s*)?['"]?(\d+)['"]?/i);
    return {
      type: 'GL_REQUIRES_LOCATION',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // Invalid GL account
  if ((lower.includes('account') || lower.includes('gl')) && 
      (lower.includes('invalid') || lower.includes('not found') || lower.includes('does not exist'))) {
    const match = message.match(/account\s*(?:number\s*)?['"]?(\d+)['"]?/i);
    return {
      type: 'INVALID_GL_ACCOUNT',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // Invalid location
  if (lower.includes('location') && (lower.includes('invalid') || lower.includes('not found'))) {
    const match = message.match(/location\s*['"]?([^'"]+)['"]?/i);
    return {
      type: 'INVALID_LOCATION',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // Invalid department
  if (lower.includes('department') && (lower.includes('invalid') || lower.includes('not found'))) {
    const match = message.match(/department\s*['"]?([^'"]+)['"]?/i);
    return {
      type: 'INVALID_DEPARTMENT',
      extractedValue: match?.[1]?.trim(),
      originalMessage: message,
      recoverable: true,
    };
  }

  // Permission denied
  if (lower.includes('permission') || lower.includes('access denied') || lower.includes('not authorized')) {
    return {
      type: 'PERMISSION_DENIED',
      originalMessage: message,
      recoverable: false,
    };
  }

  // Duplicate record
  if (lower.includes('duplicate') || lower.includes('already exists')) {
    return {
      type: 'DUPLICATE_RECORD',
      originalMessage: message,
      recoverable: false,
    };
  }

  // Required field missing
  if (lower.includes('required') && (lower.includes('field') || lower.includes('missing'))) {
    return {
      type: 'REQUIRED_FIELD_MISSING',
      originalMessage: message,
      recoverable: false,
    };
  }

  return {
    type: 'UNKNOWN',
    originalMessage: message,
    recoverable: false,
  };
}

/**
 * Get a human-readable description of an error type
 */
export function describeErrorType(type: SageErrorType): string {
  const descriptions: Record<SageErrorType, string> = {
    INVALID_CUSTOMER: 'Invalid or non-existent customer',
    MISSING_CURRENCY: 'Transaction currency not specified',
    MISSING_BASE_CURRENCY: 'Base currency not specified',
    BANK_ACCOUNT_USED_AS_GL: 'GL account is a bank account (cannot use for invoice lines)',
    INVALID_GL_ACCOUNT: 'Invalid or non-existent GL account',
    GL_REQUIRES_DEPARTMENT: 'GL account requires a Department dimension',
    GL_REQUIRES_LOCATION: 'GL account requires a Location dimension',
    INVALID_LOCATION: 'Invalid or non-existent location',
    INVALID_DEPARTMENT: 'Invalid or non-existent department',
    PERMISSION_DENIED: 'Insufficient permissions',
    DUPLICATE_RECORD: 'Record already exists',
    REQUIRED_FIELD_MISSING: 'Required field is missing',
    UNKNOWN: 'Unknown error',
  };
  return descriptions[type];
}
