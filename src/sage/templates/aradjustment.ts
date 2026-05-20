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
