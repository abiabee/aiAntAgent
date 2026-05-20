/**
 * Bank Account Templates - Query bank/checking accounts for Sage Intacct API
 */

/**
 * Query Checking Accounts
 * Lists checking/bank accounts that can be used for payments
 */
export const queryCheckingAccountsTemplate = `
<query>
  <object>CHECKINGACCOUNT</object>
  <select>
    <field>BANKACCOUNTID</field>
    <field>BANKACCOUNTNO</field>
    <field>BANKNAME</field>
    <field>DESCRIPTION</field>
    <field>CURRENCY</field>
    <field>STATUS</field>
    <field>GLACCOUNTNO</field>
    <field>GLACCOUNTTITLE</field>
  </select>
  <filter>
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryCheckingAccountsData {
  pageSize?: number;
}

/**
 * Query Savings Accounts
 * Lists savings accounts that can be used for payments
 */
export const querySavingsAccountsTemplate = `
<query>
  <object>SAVINGSACCOUNT</object>
  <select>
    <field>BANKACCOUNTID</field>
    <field>BANKACCOUNTNO</field>
    <field>BANKNAME</field>
    <field>CURRENCY</field>
    <field>STATUS</field>
    <field>GLACCOUNTNO</field>
  </select>
  <filter>
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QuerySavingsAccountsData {
  pageSize?: number;
}

/**
 * Query Undeposited Funds Accounts
 * Lists GL accounts that can be used as undeposited funds accounts for payments
 * These are typically asset accounts used to hold payments before deposit
 */
export const queryUndepositedFundsTemplate = `
<query>
  <object>GLACCOUNT</object>
  <select>
    <field>ACCOUNTNO</field>
    <field>TITLE</field>
    <field>ACCOUNTTYPE</field>
    <field>NORMALBALANCE</field>
    <field>STATUS</field>
  </select>
  <filter>
    <and>
      <equalto>
        <field>STATUS</field>
        <value>active</value>
      </equalto>
      <like>
        <field>TITLE</field>
        <value>%undeposited%</value>
      </like>
    </and>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryUndepositedFundsData {
  pageSize?: number;
}
