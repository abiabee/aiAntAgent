/**
 * GL Account Templates - General Ledger account queries for Sage Intacct API
 */

/**
 * Query GL Accounts
 * Lists GL accounts, optionally filtered by type (revenue, expense, etc.)
 */
export const queryGlAccountsTemplate = `
<query>
  <object>GLACCOUNT</object>
  <select>
    <field>RECORDNO</field>
    <field>ACCOUNTNO</field>
    <field>TITLE</field>
    <field>ACCOUNTTYPE</field>
    <field>NORMALBALANCE</field>
    <field>STATUS</field>
    <field>CATEGORY</field>
  </select>
  <filter>
    {{#if accountType}}
    <and>
      <equalto>
        <field>STATUS</field>
        <value>active</value>
      </equalto>
      <equalto>
        <field>ACCOUNTTYPE</field>
        <value>{{accountType}}</value>
      </equalto>
    </and>
    {{else}}
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
    {{/if}}
  </filter>
  <pagesize>{{pageSize}}</pagesize>
  {{#if offset}}
  <offset>{{offset}}</offset>
  {{/if}}
</query>`;

export interface QueryGlAccountsData {
  accountType?: string;  // e.g., "incomestatement", "balancesheet"
  pageSize?: number;
  offset?: number;
}

/**
 * Read GL Account by ACCOUNTNO
 */
export const readGlAccountTemplate = `
<readByName>
  <object>GLACCOUNT</object>
  <keys>{{accountNo}}</keys>
  <fields>*</fields>
</readByName>`;

export interface ReadGlAccountData {
  accountNo: string;
}

/**
 * Query Revenue Accounts (for invoice line items)
 * Filters to accounts typically used for AR invoices
 */
export const queryRevenueAccountsTemplate = `
<query>
  <object>GLACCOUNT</object>
  <select>
    <field>RECORDNO</field>
    <field>ACCOUNTNO</field>
    <field>TITLE</field>
    <field>ACCOUNTTYPE</field>
    <field>NORMALBALANCE</field>
  </select>
  <filter>
    <and>
      <equalto>
        <field>STATUS</field>
        <value>active</value>
      </equalto>
      <equalto>
        <field>NORMALBALANCE</field>
        <value>credit</value>
      </equalto>
    </and>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryRevenueAccountsData {
  pageSize?: number;
}

/**
 * Query AR Account Labels
 * Account labels are shortcuts that map to GL accounts with dimensions
 */
export const queryAccountLabelsTemplate = `
<query>
  <object>ACCOUNTLABEL</object>
  <select>
    <field>RECORDNO</field>
    <field>ACCOUNTLABEL</field>
    <field>DESCRIPTION</field>
    <field>GLACCOUNTNO</field>
    <field>GLACCOUNT.TITLE</field>
    <field>STATUS</field>
  </select>
  <filter>
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryAccountLabelsData {
  pageSize?: number;
}
