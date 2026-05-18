/**
 * Dimension Templates - Department, Location queries for Sage Intacct API
 */

/**
 * Query Departments
 */
export const queryDepartmentsTemplate = `
<query>
  <object>DEPARTMENT</object>
  <select>
    <field>RECORDNO</field>
    <field>DEPARTMENTID</field>
    <field>TITLE</field>
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

export interface QueryDepartmentsData {
  pageSize?: number;
}

/**
 * Query Locations
 */
export const queryLocationsTemplate = `
<query>
  <object>LOCATION</object>
  <select>
    <field>RECORDNO</field>
    <field>LOCATIONID</field>
    <field>NAME</field>
    <field>STATUS</field>
    <field>PARENTID</field>
  </select>
  <filter>
    <equalto>
      <field>STATUS</field>
      <value>active</value>
    </equalto>
  </filter>
  <pagesize>{{pageSize}}</pagesize>
</query>`;

export interface QueryLocationsData {
  pageSize?: number;
}
