import axios, { AxiosInstance } from 'axios';
import { SageCredentials, wrapRequest, compileTemplate } from './templates/common.js';
import { parseResponse, SageResponse } from './parser.js';
import { getAPISessionTemplate, GetAPISessionData } from './templates/auth.js';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_ENDPOINT = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

export interface SageSession {
  sessionId: string;
  endpoint: string;
  createdAt: Date;
}

export interface SageClientConfig {
  credentials: SageCredentials;
  outputDir?: string;
  debug?: boolean;
}

/**
 * Sage Intacct API Client
 * Handles session management and XML request/response
 */
export class SageClient {
  private credentials: SageCredentials;
  private session: SageSession | null = null;
  private httpClient: AxiosInstance;
  private outputDir: string;
  private debug: boolean;
  private requestCount = 0;

  constructor(config: SageClientConfig) {
    this.credentials = config.credentials;
    this.outputDir = config.outputDir || './outputs/xml';
    this.debug = config.debug || false;

    this.httpClient = axios.create({
      headers: {
        'Content-Type': 'application/xml',
      },
      timeout: 60000,
    });
  }

  /**
   * Get current session, creating one if needed
   */
  async getSession(): Promise<SageSession> {
    if (this.session && this.isSessionValid()) {
      return this.session;
    }
    return this.createSession();
  }

  /**
   * Create a new API session
   */
  async createSession(locationId?: string): Promise<SageSession> {
    const data: GetAPISessionData = {};
    if (locationId || this.credentials.locationId) {
      data.locationId = locationId || this.credentials.locationId;
    }

    const functionContent = compileTemplate(getAPISessionTemplate, data);
    
    const requestXml = wrapRequest(functionContent, {
      credentials: this.credentials,
    });

    const response = await this.sendRequest(requestXml, 'createSession');

    if (!response.success) {
      throw new Error(`Failed to create session: ${response.error?.description || 'Unknown error'}`);
    }

    if (!response.sessionId || !response.endpoint) {
      throw new Error('Session response missing sessionId or endpoint');
    }

    this.session = {
      sessionId: response.sessionId,
      endpoint: response.endpoint,
      createdAt: new Date(),
    };

    if (this.debug) {
      console.log(`[SageClient] Session created: ${this.session.sessionId.substring(0, 20)}...`);
      console.log(`[SageClient] Endpoint: ${this.session.endpoint}`);
    }

    return this.session;
  }

  /**
   * Execute a Sage API function
   */
  async execute<T extends object>(
    templateString: string,
    templateData: T,
    actionName: string
  ): Promise<SageResponse> {
    // Ensure we have a session
    const session = await this.getSession();

    // Compile the template
    const functionContent = compileTemplate(templateString, templateData);

    // Wrap in request envelope with session auth
    const requestXml = wrapRequest(functionContent, {
      credentials: this.credentials,
      sessionId: session.sessionId,
    });

    // Send request to session endpoint
    return this.sendRequest(requestXml, actionName, session.endpoint);
  }

  /**
   * Send raw XML request
   */
  private async sendRequest(
    requestXml: string,
    actionName: string,
    endpoint: string = DEFAULT_ENDPOINT
  ): Promise<SageResponse> {
    this.requestCount++;
    const requestId = `${actionName}-${this.requestCount}-${Date.now()}`;

    // Save request XML
    await this.saveXml(requestXml, `request-${requestId}.xml`);

    if (this.debug) {
      console.log(`[SageClient] Sending ${actionName} to ${endpoint}`);
    }

    try {
      const httpResponse = await this.httpClient.post(endpoint, requestXml);
      const responseXml = httpResponse.data as string;

      // Save response XML
      await this.saveXml(responseXml, `response-${requestId}.xml`);

      // Parse response
      const parsed = parseResponse(responseXml);
      
      if (this.debug) {
        if (parsed.success) {
          console.log(`[SageClient] ${actionName} succeeded`);
        } else {
          console.log(`[SageClient] ${actionName} failed: ${parsed.error?.description}`);
        }
      }

      return parsed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.debug) {
        console.error(`[SageClient] HTTP error: ${errorMessage}`);
      }

      return {
        success: false,
        error: {
          description: `HTTP request failed: ${errorMessage}`,
        },
      };
    }
  }

  /**
   * Save XML to output directory
   */
  private async saveXml(xml: string, filename: string): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      const filepath = path.join(this.outputDir, filename);
      await fs.writeFile(filepath, xml, 'utf-8');
    } catch (error) {
      if (this.debug) {
        console.warn(`[SageClient] Failed to save XML: ${error}`);
      }
    }
  }

  /**
   * Check if current session is still valid (< 30 minutes old)
   */
  private isSessionValid(): boolean {
    if (!this.session) return false;
    
    const now = new Date();
    const sessionAge = now.getTime() - this.session.createdAt.getTime();
    const maxAge = 25 * 60 * 1000; // 25 minutes (Sage sessions expire after 30)
    
    return sessionAge < maxAge;
  }

  /**
   * Clear current session
   */
  clearSession(): void {
    this.session = null;
  }

  /**
   * Get session info (for debugging)
   */
  getSessionInfo(): { hasSession: boolean; sessionAge?: number; endpoint?: string } {
    if (!this.session) {
      return { hasSession: false };
    }

    const now = new Date();
    const sessionAge = Math.floor((now.getTime() - this.session.createdAt.getTime()) / 1000);
    
    return {
      hasSession: true,
      sessionAge,
      endpoint: this.session.endpoint,
    };
  }
}

/**
 * Create a SageClient from environment variables
 */
export function createClientFromEnv(debug = false): SageClient {
  const credentials: SageCredentials = {
    senderId: process.env.SAGE_SENDER_ID || '',
    senderPassword: process.env.SAGE_SENDER_PASSWORD || '',
    companyId: process.env.SAGE_COMPANY_ID || '',
    userId: process.env.SAGE_USER_ID || '',
    userPassword: process.env.SAGE_USER_PASSWORD || '',
    locationId: process.env.SAGE_LOCATION_ID || undefined,
  };

  // Validate required credentials
  const missing: string[] = [];
  if (!credentials.senderId) missing.push('SAGE_SENDER_ID');
  if (!credentials.senderPassword) missing.push('SAGE_SENDER_PASSWORD');
  if (!credentials.companyId) missing.push('SAGE_COMPANY_ID');
  if (!credentials.userId) missing.push('SAGE_USER_ID');
  if (!credentials.userPassword) missing.push('SAGE_USER_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return new SageClient({
    credentials,
    debug,
  });
}
