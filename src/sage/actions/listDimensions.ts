import { SageClient } from '../client.js';
import { 
  queryDepartmentsTemplate, 
  QueryDepartmentsData,
  queryLocationsTemplate,
  QueryLocationsData
} from '../templates/dimension.js';
import { extractData, ensureArray } from '../parser.js';

export interface Department {
  RECORDNO: string;
  DEPARTMENTID: string;
  TITLE?: string;
  STATUS?: string;
}

export interface Location {
  RECORDNO: string;
  LOCATIONID: string;
  NAME?: string;
  STATUS?: string;
  PARENTID?: string;
}

export interface ListDepartmentsResult {
  success: boolean;
  departments: Department[];
  error?: string;
}

export interface ListLocationsResult {
  success: boolean;
  locations: Location[];
  error?: string;
}

/**
 * List departments from Sage Intacct
 */
export async function listDepartments(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListDepartmentsResult> {
  const data: QueryDepartmentsData = {
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryDepartmentsTemplate, data, 'listDepartments');

  if (!response.success) {
    return {
      success: false,
      departments: [],
      error: response.error?.description || 'Failed to list departments',
    };
  }

  const rawDepartments = extractData<Department>(response, 'DEPARTMENT');
  const departments = ensureArray(rawDepartments);

  return {
    success: true,
    departments,
  };
}

/**
 * List locations from Sage Intacct
 */
export async function listLocations(
  client: SageClient,
  options: { pageSize?: number } = {}
): Promise<ListLocationsResult> {
  const data: QueryLocationsData = {
    pageSize: options.pageSize || 50,
  };

  const response = await client.execute(queryLocationsTemplate, data, 'listLocations');

  if (!response.success) {
    return {
      success: false,
      locations: [],
      error: response.error?.description || 'Failed to list locations',
    };
  }

  const rawLocations = extractData<Location>(response, 'LOCATION');
  const locations = ensureArray(rawLocations);

  return {
    success: true,
    locations,
  };
}
