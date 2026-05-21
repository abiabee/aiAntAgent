import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

export interface SageResponse {
  success: boolean;
  controlId?: string;
  sessionId?: string;
  endpoint?: string;
  data?: unknown;
  key?: string;  // For create operations that return a key
  error?: SageError;
  rawXml?: string;
}

export interface SageError {
  code?: string;
  description?: string;
  description2?: string;
  correction?: string;
  allErrors?: SageErrorDetail[];
}

export interface SageErrorDetail {
  errorno: string;
  description: string;
  description2: string;
  correction: string;
}

/**
 * Parse Sage Intacct XML response
 */
export function parseResponse(xmlString: string): SageResponse {
  const result = parser.parse(xmlString);
  
  const response = result.response;
  if (!response) {
    return {
      success: false,
      error: { description: 'Invalid response: no response element' },
      rawXml: xmlString,
    };
  }

  // Check control status
  const controlStatus = response.control?.status;
  if (controlStatus === 'failure') {
    const errormessage = response.errormessage?.error;
    return {
      success: false,
      controlId: response.control?.controlid,
      error: extractError(errormessage),
      rawXml: xmlString,
    };
  }

  // Check operation result
  const operation = response.operation;
  if (!operation) {
    return {
      success: false,
      error: { description: 'Invalid response: no operation element' },
      rawXml: xmlString,
    };
  }

  // Check authentication
  const authStatus = operation.authentication?.status;
  if (authStatus === 'failure') {
    return {
      success: false,
      error: { description: 'Authentication failed' },
      rawXml: xmlString,
    };
  }

  // Get sessionId if this was a session creation response
  const sessionId = operation.authentication?.sessionid;

  // Check result
  const resultElement = operation.result;
  if (!resultElement) {
    return {
      success: false,
      error: { description: 'Invalid response: no result element' },
      rawXml: xmlString,
    };
  }

  // Handle array of results (multiple functions)
  const results = Array.isArray(resultElement) ? resultElement : [resultElement];
  
  for (const res of results) {
    if (res.status === 'failure') {
      const errormessage = res.errormessage?.error;
      return {
        success: false,
        controlId: res.controlid,
        error: extractError(errormessage),
        rawXml: xmlString,
      };
    }
  }

  // Extract data from first result
  const firstResult = results[0];
  const data = firstResult.data;

  // For getAPISession, extract endpoint and sessionid
  let endpoint: string | undefined;
  let resultSessionId: string | undefined;
  
  if (data?.api) {
    endpoint = data.api.endpoint;
    resultSessionId = data.api.sessionid;
  }

  // For create operations, extract the key (record number of created object)
  const key = firstResult.key ? String(firstResult.key) : undefined;

  return {
    success: true,
    controlId: firstResult.controlid,
    sessionId: resultSessionId || sessionId,
    endpoint,
    data,
    key,
    rawXml: xmlString,
  };
}

/**
 * Extract error details from error element
 * Sage errors have: errorno, description (often empty), description2 (actual message), correction
 */
function extractError(errormessage: unknown): SageError {
  if (!errormessage) {
    return { description: 'Unknown error' };
  }

  // Handle array of errors
  const errors = Array.isArray(errormessage) ? errormessage : [errormessage];
  
  // Extract all error details
  const allErrors: SageErrorDetail[] = errors.map((err: Record<string, string>) => ({
    errorno: err.errorno || '',
    description: err.description || '',
    description2: err.description2 || '',
    correction: err.correction || '',
  }));

  // Build the primary error message from the first error
  // Combine description and description2 since description is often empty
  const firstError = allErrors[0];
  const mainDescription = [firstError.description, firstError.description2]
    .filter(Boolean)
    .join(' - ') || 'Unknown error';

  return {
    code: firstError.errorno,
    description: mainDescription,
    description2: firstError.description2,
    correction: firstError.correction,
    allErrors,
  };
}

/**
 * Decode HTML entities in a string
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

/**
 * Format all Sage errors into a readable string
 */
export function formatSageErrors(error: SageError): string {
  if (!error.allErrors || error.allErrors.length === 0) {
    return decodeHtmlEntities(error.description || 'Unknown error');
  }

  const lines: string[] = [];
  
  for (const err of error.allErrors) {
    const message = [err.description, err.description2].filter(Boolean).join(' - ');
    if (message) {
      lines.push(`[${err.errorno || 'ERROR'}] ${decodeHtmlEntities(message)}`);
      if (err.correction) {
        lines.push(`  → Fix: ${decodeHtmlEntities(err.correction)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Extract specific data from response by path
 * e.g., extractData(response, 'ARINVOICE') or extractData(response, 'CUSTOMER')
 */
export function extractData<T = unknown>(response: SageResponse, objectName: string): T | T[] | null {
  if (!response.success || !response.data) {
    return null;
  }

  const data = response.data as Record<string, unknown>;
  
  // Check for the object directly in data
  if (data[objectName]) {
    return data[objectName] as T | T[];
  }

  // Check in nested structures (query results, read results)
  if (data['@_listtype'] && data[objectName.toLowerCase()]) {
    return data[objectName.toLowerCase()] as T | T[];
  }

  // For query results, may be nested under the object name
  const keys = Object.keys(data);
  for (const key of keys) {
    const value = data[key] as Record<string, unknown>;
    if (value && typeof value === 'object' && value[objectName]) {
      return value[objectName] as T | T[];
    }
  }

  return null;
}

/**
 * Ensure data is always an array
 */
export function ensureArray<T>(data: T | T[] | null): T[] {
  if (data === null || data === undefined) {
    return [];
  }
  return Array.isArray(data) ? data : [data];
}
