/**
 * AR Adjustment Templates - Sage Intacct API
 */

/**
 * Query AR Adjustments with optional filters
 */
export const queryArAdjustmentsTemplate = `
<query>
  <object>ARADJUSTMENT</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>STATE</field>
    <field>WHENCREATED</field>
    <field>WHENPOSTED</field>
    <field>TOTALENTERED</field>
    <field>TOTALPAID</field>
    <field>TOTALDUE</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>CURRENCY</field>
    <field>BASECURR</field>
    <field>DESCRIPTION</field>
    <field>MEGAENTITYID</field>
    <field>MEGAENTITYNAME</field>
  </select>
  {{#if customerId}}
  <filter>
    <equalto>
      <field>CUSTOMERID</field>
      <value>{{customerId}}</value>
    </equalto>
  </filter>
  {{/if}}
  <orderby>
    <order>
      <field>WHENCREATED</field>
      <descending/>
    </order>
  </orderby>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryArAdjustmentsData {
  customerId?: string;
  pageSize?: number;
}

/**
 * Query AR Adjustment by RECORDID (adjustment number)
 */
export const queryArAdjustmentByIdTemplate = `
<query>
  <object>ARADJUSTMENT</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>STATE</field>
    <field>WHENCREATED</field>
    <field>WHENPOSTED</field>
    <field>WHENPAID</field>
    <field>TOTALENTERED</field>
    <field>TOTALPAID</field>
    <field>TOTALDUE</field>
    <field>TOTALSELECTED</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>TRX_TOTALSELECTED</field>
    <field>CURRENCY</field>
    <field>BASECURR</field>
    <field>DESCRIPTION</field>
    <field>DOCNUMBER</field>
    <field>BILLTOPAYTOCONTACTNAME</field>
    <field>SHIPTORETURNTOCONTACTNAME</field>
    <field>MEGAENTITYID</field>
    <field>MEGAENTITYNAME</field>
    <field>PRBATCH</field>
    <field>AUWHENCREATED</field>
    <field>WHENMODIFIED</field>
    <field>CREATEDBY</field>
    <field>MODIFIEDBY</field>
  </select>
  <filter>
    <equalto>
      <field>RECORDID</field>
      <value>{{recordId}}</value>
    </equalto>
  </filter>
</query>`;

export interface QueryArAdjustmentByIdData {
  recordId: string;
}

/**
 * Read AR Adjustment by RECORDNO (full details)
 */
export const readArAdjustmentTemplate = `
<read>
  <object>ARADJUSTMENT</object>
  <keys>{{recordNo}}</keys>
  <fields>*</fields>
</read>`;

export interface ReadArAdjustmentData {
  recordNo: string;
}

/**
 * Query AR Adjustments by multiple filters
 */
export const queryArAdjustmentsFilteredTemplate = `
<query>
  <object>ARADJUSTMENT</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>STATE</field>
    <field>WHENCREATED</field>
    <field>WHENPOSTED</field>
    <field>TOTALENTERED</field>
    <field>TOTALPAID</field>
    <field>TOTALDUE</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>CURRENCY</field>
    <field>DESCRIPTION</field>
    <field>MEGAENTITYID</field>
  </select>
  <filter>
    {{#if hasMultipleFilters}}
    <and>
    {{/if}}
    {{#if customerId}}
      <equalto>
        <field>CUSTOMERID</field>
        <value>{{customerId}}</value>
      </equalto>
    {{/if}}
    {{#if recordId}}
      <equalto>
        <field>RECORDID</field>
        <value>{{recordId}}</value>
      </equalto>
    {{/if}}
    {{#if recordNo}}
      <equalto>
        <field>RECORDNO</field>
        <value>{{recordNo}}</value>
      </equalto>
    {{/if}}
    {{#if state}}
      <equalto>
        <field>STATE</field>
        <value>{{state}}</value>
      </equalto>
    {{/if}}
    {{#if hasMultipleFilters}}
    </and>
    {{/if}}
  </filter>
  <orderby>
    <order>
      <field>WHENCREATED</field>
      <descending/>
    </order>
  </orderby>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryArAdjustmentsFilteredData {
  customerId?: string;
  recordId?: string;
  recordNo?: string;
  state?: string;
  hasMultipleFilters?: boolean;
  pageSize?: number;
}

/**
 * Create AR Adjustment template
 * Based on Sage Intacct API - uses <create><ARADJUSTMENT> format with dimensions support
 */
export const createArAdjustmentTemplate = `
<create>
  <ARADJUSTMENT>
    <CUSTOMERID>{{customerId}}</CUSTOMERID>
    <WHENCREATED>{{whenCreated}}</WHENCREATED>
    {{#if invoiceNo}}
    <INVOICENO>{{invoiceNo}}</INVOICENO>
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
    {{#if exchangeRate}}
    <EXCHRATE>{{exchangeRate}}</EXCHRATE>
    {{/if}}
    <ARADJUSTMENTITEMS>
      {{#each lineItems}}
      <ARADJUSTMENTITEM>
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
      </ARADJUSTMENTITEM>
      {{/each}}
    </ARADJUSTMENTITEMS>
  </ARADJUSTMENT>
</create>`;

export interface ArAdjustmentLineItem {
  glAccountNo?: string;
  accountLabel?: string;
  amount: number;
  memo?: string;
  locationId?: string;
  departmentId?: string;
}

export interface CreateArAdjustmentData {
  customerId: string;
  whenCreated: string;
  invoiceNo?: string;
  description?: string;
  baseCurrency?: string;
  currency?: string;
  exchangeRate?: number;
  lineItems: ArAdjustmentLineItem[];
}

/**
 * Query Credit Memos by Customer
 * Credit memos are AR adjustments with RECORDTYPE = 'ra' and negative amounts
 * Supports optional state filter (Paid, Posted, etc.)
 */
export const queryCreditMemosByCustomerTemplate = `
<query>
  <object>ARADJUSTMENT</object>
  <select>
    <field>RECORDNO</field>
    <field>RECORDID</field>
    <field>RECORDTYPE</field>
    <field>CUSTOMERID</field>
    <field>CUSTOMERNAME</field>
    <field>DESCRIPTION</field>
    <field>WHENCREATED</field>
    <field>WHENPOSTED</field>
    <field>WHENPAID</field>
    <field>CURRENCY</field>
    <field>BASECURR</field>
    <field>TOTALENTERED</field>
    <field>TRX_TOTALENTERED</field>
    <field>TRX_TOTALPAID</field>
    <field>TRX_TOTALDUE</field>
    <field>TRX_TOTALSELECTED</field>
    <field>TOTALDUE</field>
    <field>STATE</field>
    <field>MEGAENTITYID</field>
  </select>
  <filter>
    <and>
      <equalto>
        <field>CUSTOMERID</field>
        <value>{{customerId}}</value>
      </equalto>
      {{#if currency}}
      <equalto>
        <field>CURRENCY</field>
        <value>{{currency}}</value>
      </equalto>
      {{/if}}
      {{#if state}}
      <equalto>
        <field>STATE</field>
        <value>{{state}}</value>
      </equalto>
      {{/if}}
      <equalto>
        <field>RECORDTYPE</field>
        <value>ra</value>
      </equalto>
      <lessthan>
        <field>TOTALENTERED</field>
        <value>0</value>
      </lessthan>
    </and>
  </filter>
  <orderby>
    <order>
      <field>TRX_TOTALDUE</field>
      <ascending/>
    </order>
  </orderby>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryCreditMemosByCustomerData {
  customerId: string;
  currency?: string;
  state?: string;  // Paid, Posted, Submitted, etc.
  pageSize?: number;
}

/**
 * Create Credit Memo (AR Adjustment with negative amount)
 * Uses the legacy create_aradjustment format for better compatibility
 * 
 * Key points:
 * - Use exchrate (not exchratedate + exchratetype)
 * - No line-level customerid (header customer is enough)
 * - Amount must be negative for credit memos
 */
export const createCreditMemoTemplate = `
<create_aradjustment>
  <customerid>{{customerId}}</customerid>
  <datecreated>
    <year>{{year}}</year>
    <month>{{month}}</month>
    <day>{{day}}</day>
  </datecreated>
  {{#if adjustmentNo}}
  <adjustmentno>{{adjustmentNo}}</adjustmentno>
  {{/if}}
  <action>Submit</action>
  {{#if description}}
  <description>{{description}}</description>
  {{/if}}
  <basecurr>{{baseCurrency}}</basecurr>
  <currency>{{currency}}</currency>
  <exchrate>{{exchangeRate}}</exchrate>
  <nogl>false</nogl>
  <aradjustmentitems>
    {{#each lineItems}}
    <lineitem>
      {{#if accountLabel}}
      <accountlabel>{{accountLabel}}</accountlabel>
      {{else}}
      <glaccountno>{{glAccountNo}}</glaccountno>
      {{/if}}
      <amount>{{amount}}</amount>
      {{#if memo}}
      <memo>{{memo}}</memo>
      {{/if}}
      {{#if locationId}}
      <locationid>{{locationId}}</locationid>
      {{/if}}
      {{#if departmentId}}
      <departmentid>{{departmentId}}</departmentid>
      {{/if}}
      {{#if classId}}
      <classid>{{classId}}</classid>
      {{/if}}
    </lineitem>
    {{/each}}
  </aradjustmentitems>
</create_aradjustment>`;

export interface CreditMemoLineItem {
  glAccountNo?: string;
  accountLabel?: string;
  amount: number;  // Must be negative for credit memos
  memo?: string;
  locationId?: string;
  departmentId?: string;
  classId?: string;
}

export interface CreateCreditMemoData {
  customerId: string;
  year: string;
  month: string;
  day: string;
  adjustmentNo?: string;
  description?: string;
  baseCurrency: string;  // Required
  currency: string;      // Required
  exchangeRate: number;  // Required (use 1 for same currency)
  lineItems: CreditMemoLineItem[];
}
