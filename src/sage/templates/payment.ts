/**
 * Payment Templates - AR Payment operations for Sage Intacct API
 */

/**
 * Create AR Payment
 * Pays one or more invoices
 */
export const createArPaymentTemplate = `
<create>
  <ARPYMT>
    <CUSTOMERID>{{customerId}}</CUSTOMERID>
    <PAYMENTMETHOD>{{paymentMethod}}</PAYMENTMETHOD>
    <RECEIPTDATE>{{receiptDate}}</RECEIPTDATE>
    {{#if checkingAccountId}}
    <FINANCIALENTITY>{{checkingAccountId}}</FINANCIALENTITY>
    {{/if}}
    {{#if docNumber}}
    <DOCNUMBER>{{docNumber}}</DOCNUMBER>
    {{/if}}
    <BASECURR>{{baseCurrency}}</BASECURR>
    {{#if currency}}
    <CURRENCY>{{currency}}</CURRENCY>
    {{/if}}
    {{#if amountToPay}}
    <TRX_AMOUNTTOPAY>{{amountToPay}}</TRX_AMOUNTTOPAY>
    {{/if}}
    <ARPYMTDETAILS>
      {{#each invoices}}
      <ARPYMTDETAIL>
        <RECORDKEY>{{recordNo}}</RECORDKEY>
        <TRX_PAYMENTAMOUNT>{{paymentAmount}}</TRX_PAYMENTAMOUNT>
      </ARPYMTDETAIL>
      {{/each}}
    </ARPYMTDETAILS>
  </ARPYMT>
</create>`;

export interface PaymentInvoice {
  recordNo: string;
  paymentAmount: number;
}

export interface CreateArPaymentData {
  customerId: string;
  paymentMethod: string;  // "Cash", "Check", "Credit Card", "EFT", "ACH", etc.
  receiptDate: string;    // MM/DD/YYYY format
  checkingAccountId?: string;
  docNumber?: string;
  currency?: string;
  baseCurrency?: string;
  amountToPay?: number;
  invoices: PaymentInvoice[];
}

/**
 * Query AR Payments
 */
export const queryArPaymentsTemplate = `
<query>
  <object>ARPYMT</object>
  <select>
    <field>RECORDNO</field>
    <field>DOCNUMBER</field>
    <field>CUSTOMERID</field>
    <field>PAYMENTMETHOD</field>
    <field>RECEIPTDATE</field>
    <field>TRX_TOTALPAID</field>
    <field>STATE</field>
    <field>CURRENCY</field>
  </select>
  {{#if customerId}}
  <filter>
    <equalto>
      <field>CUSTOMERID</field>
      <value>{{customerId}}</value>
    </equalto>
  </filter>
  {{/if}}
  <pagesize>{{pageSize}}</pagesize>
  <orderby>
    <order>
      <field>RECEIPTDATE</field>
      <descending/>
    </order>
  </orderby>
</query>`;

export interface QueryArPaymentsData {
  customerId?: string;
  pageSize?: number;
}

/**
 * Read AR Payment by RECORDNO
 */
export const readArPaymentTemplate = `
<read>
  <object>ARPYMT</object>
  <keys>{{recordNo}}</keys>
  <fields>*</fields>
</read>`;

export interface ReadArPaymentData {
  recordNo: string;
}

/**
 * Reverse AR Payment
 */
export const reverseArPaymentTemplate = `
<reverse_arpayment key="{{recordNo}}">
  <datereversed>
    <year>{{year}}</year>
    <month>{{month}}</month>
    <day>{{day}}</day>
  </datereversed>
</reverse_arpayment>`;

export interface ReverseArPaymentData {
  recordNo: string;
  year: string;
  month: string;
  day: string;
}
