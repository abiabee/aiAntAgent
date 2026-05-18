import Handlebars from 'handlebars';
import { v4 as uuidv4 } from 'uuid';

export interface SageCredentials {
  senderId: string;
  senderPassword: string;
  companyId: string;
  userId: string;
  userPassword: string;
  locationId?: string;
}

export interface RequestOptions {
  credentials: SageCredentials;
  sessionId?: string;
  controlId?: string;
}

/**
 * Wraps any Sage Intacct function call in the standard request envelope.
 * Supports both session-based auth and login-based auth.
 */
export function wrapRequest(functionContent: string, options: RequestOptions): string {
  const controlId = options.controlId || uuidv4();
  
  const authBlock = options.sessionId 
    ? `<sessionid>${options.sessionId}</sessionid>`
    : `<login>
        <userid>${options.credentials.userId}</userid>
        <companyid>${options.credentials.companyId}</companyid>
        <password>${options.credentials.userPassword}</password>
      </login>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${options.credentials.senderId}</senderid>
    <password>${options.credentials.senderPassword}</password>
    <controlid>${controlId}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      ${authBlock}
    </authentication>
    <content>
      <function controlid="${controlId}">
        ${functionContent}
      </function>
    </content>
  </operation>
</request>`;
}

/**
 * Compiles a Handlebars template with data
 */
export function compileTemplate<T extends object>(template: string, data: T): string {
  const compiled = Handlebars.compile(template);
  return compiled(data as Record<string, unknown>);
}
