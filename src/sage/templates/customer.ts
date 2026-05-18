/**
 * Customer Templates - Customer queries for Sage Intacct API
 */

/**
 * Query Customers
 * Lists all customers with optional filtering
 */
export const queryCustomersTemplate = `
<query>
  <object>CUSTOMER</object>
  <select>
    <field>CUSTOMERID</field>
    <field>NAME</field>
    <field>STATUS</field>
    <field>DISPLAYCONTACT.EMAIL1</field>
    <field>DISPLAYCONTACT.PHONE1</field>
    <field>DISPLAYCONTACT.CONTACTNAME</field>
    <field>TERMNAME</field>
    <field>CURRENCY</field>
  </select>
  {{#if customerId}}
  <filter>
    <equalto>
      <field>CUSTOMERID</field>
      <value>{{customerId}}</value>
    </equalto>
  </filter>
  {{else}}
  <filter>
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
  </filter>
  {{/if}}
  <pagesize>{{pageSize}}</pagesize>
  {{#if offset}}
  <offset>{{offset}}</offset>
  {{/if}}
</query>`;

export interface QueryCustomersData {
  customerId?: string;
  pageSize?: number;
  offset?: number;
}

/**
 * Read Customer by CUSTOMERID
 */
export const readCustomerTemplate = `
<readByName>
  <object>CUSTOMER</object>
  <keys>{{customerId}}</keys>
  <fields>*</fields>
</readByName>`;

export interface ReadCustomerData {
  customerId: string;
}

/**
 * Query Customer by name (partial match)
 */
export const searchCustomerTemplate = `
<query>
  <object>CUSTOMER</object>
  <select>
    <field>CUSTOMERID</field>
    <field>NAME</field>
    <field>STATUS</field>
    <field>TERMNAME</field>
  </select>
  <filter>
    <and>
      <like>
        <field>NAME</field>
        <value>%{{searchTerm}}%</value>
      </like>
      <equalto>
        <field>STATUS</field>
        <value>active</value>
      </equalto>
    </and>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface SearchCustomerData {
  searchTerm: string;
  pageSize?: number;
}
