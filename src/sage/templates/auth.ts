/**
 * Auth Templates - Session management for Sage Intacct API
 */

/**
 * Get API Session
 * Creates a new API session. Optionally scoped to a location/entity.
 * 
 * Response will contain:
 * - sessionid: The session ID to use for subsequent requests
 * - endpoint: The API endpoint URL to use
 */
export const getAPISessionTemplate = `
<getAPISession>
  {{#if locationId}}
  <locationid>{{locationId}}</locationid>
  {{/if}}
</getAPISession>`;

/**
 * Template data interface for getAPISession
 */
export interface GetAPISessionData {
  locationId?: string;
}
