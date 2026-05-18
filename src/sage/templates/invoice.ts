/**
 * Invoice Templates - AR Invoice operations for Sage Intacct API
 */

/**
 * Read Invoice by RECORDNO
 * Fetches a single invoice by its record number
 */
export const readInvoiceTemplate = `
<read>
  <object>ARINVOICE</object>
  <keys>{{recordNo}}</keys>
  <fields>*</fields>
</read>`;

export interface ReadInvoiceData {
  recordNo: string;
}

/**
 * Query Invoice by RECORDID (document number)
 */
export const queryInvoiceByIdTemplate = `
<query>
  <object>ARINVOICE</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>TOTALENTERED</field>
    <field>TOTALPAID</field>
    <field>TOTALDUE</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>STATE</field>
    <field>CURRENCY</field>
    <field>WHENCREATED</field>
    <field>WHENDUE</field>
    <field>DESCRIPTION</field>
  </select>
  <filter>
    <equalto>
      <field>RECORDID</field>
      <value>{{recordId}}</value>
    </equalto>
  </filter>
</query>`;

export interface QueryInvoiceByIdData {
  recordId: string;
}

/**
 * Query Open Invoices
 * Lists invoices that are Posted or Partially Paid
 */
export const queryOpenInvoicesTemplate = `
<query>
  <object>ARINVOICE</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>TOTALENTERED</field>
    <field>TOTALPAID</field>
    <field>TOTALDUE</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>STATE</field>
    <field>CURRENCY</field>
    <field>WHENCREATED</field>
    <field>WHENDUE</field>
  </select>
  <filter>
    <in>
      <field>STATE</field>
      <value>Posted</value>
      <value>Partially Paid</value>
    </in>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
  {{#if offset}}
  <offset>{{offset}}</offset>
  {{/if}}
</query>`;

export interface QueryOpenInvoicesData {
  pageSize?: number;
  offset?: number;
}

/**
 * Create AR Invoice
 * Creates a new accounts receivable invoice
 */
export const createInvoiceTemplate = `
<create>
  <ARINVOICE>
    <CUSTOMERID>{{customerId}}</CUSTOMERID>
    <WHENCREATED>{{whenCreated}}</WHENCREATED>
    <WHENDUE>{{whenDue}}</WHENDUE>
    {{#if termName}}
    <TERMNAME>{{termName}}</TERMNAME>
    {{/if}}
    {{#if description}}
    <DESCRIPTION>{{description}}</DESCRIPTION>
    {{/if}}
    {{#if baseCurrency}}
    <BASECURR>{{baseCurrency}}</BASECURR>
    {{/if}}
    {{#if currency}}
    <CURRENCY>{{currency}}</CURRENCY>
    {{/if}}
    <ARINVOICEITEMS>
      {{#each lineItems}}
      <ARINVOICEITEM>
        {{#if accountLabel}}
        <ACCOUNTLABEL>{{accountLabel}}</ACCOUNTLABEL>
        {{else}}
        <GLACCOUNTNO>{{glAccountNo}}</GLACCOUNTNO>
        {{/if}}
        <AMOUNT>{{amount}}</AMOUNT>
        {{#if memo}}
        <MEMO>{{memo}}</MEMO>
        {{/if}}
        {{#if locationId}}
        <LOCATIONID>{{locationId}}</LOCATIONID>
        {{/if}}
        {{#if departmentId}}
        <DEPARTMENTID>{{departmentId}}</DEPARTMENTID>
        {{/if}}
      </ARINVOICEITEM>
      {{/each}}
    </ARINVOICEITEMS>
  </ARINVOICE>
</create>`;

export interface InvoiceLineItem {
  glAccountNo?: string;
  accountLabel?: string;
  amount: number;
  memo?: string;
  locationId?: string;
  departmentId?: string;
}

export interface CreateInvoiceData {
  customerId: string;
  whenCreated: string;  // MM/DD/YYYY format
  whenDue: string;      // MM/DD/YYYY format
  termName?: string;
  description?: string;
  baseCurrency?: string;  // Base currency (e.g., "USD")
  currency?: string;      // Transaction currency
  lineItems: InvoiceLineItem[];
}

/**
 * Delete Invoice
 */
export const deleteInvoiceTemplate = `
<delete>
  <object>ARINVOICE</object>
  <keys>{{recordNo}}</keys>
</delete>`;

export interface DeleteInvoiceData {
  recordNo: string;
}
