# Sage Intacct Agent - CLI Commands

Complete reference for all available CLI commands.

## Usage

All commands are run via npm:

```bash
npm run agent "<command>"
```

---

## Session Commands

Manage your Sage Intacct API connection.


| Command                    | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| `session`                  | Create API session using `locationId` from `data/defaults.json`             |
| `session location <ID>`    | Create session for a specific entity/location                               |
| `session pick location`    | List locations interactively, then open session for your choice             |
| `connect` / `login`        | Aliases for `session`                                                       |
| `status`                   | Display session status (active, location, age, endpoint)                    |


Location resolution order: **command argument** → **`data/defaults.json`** → **`SAGE_LOCATION_ID` in `.env`**.

**Examples:**

```bash
npm run agent "session"
npm run agent "session location 100"
npm run agent "session pick location"
npm run agent "status"
```

---

## Invoice Commands

Work with AR (Accounts Receivable) invoices.

### List Invoices


| Command         | Description                                       |
| --------------- | ------------------------------------------------- |
| `list invoices` | List all open invoices (Posted or Partially Paid) |
| `show invoices` | Alias for `list invoices`                         |


### Get Invoice Details


| Command                          | Description                                |
| -------------------------------- | ------------------------------------------ |
| `get invoice <ID>`               | Get invoice by Invoice ID (e.g., INV25948) |
| `get invoice <RECORDNO>`         | Get invoice by record number (e.g., 54284) |
| `get invoices INV1, INV2, INV3`  | Get multiple invoices (summary view)       |
| `get invoices for customer <ID>` | List all invoices for a specific customer  |


The single invoice detail view displays:

- Header metrics (dates, amounts, state)
- Transaction details (customer, bill-to, ship-to)
- Terms & dates
- Integration fields (Paystand UUID, tokens)
- Line items with GL accounts
- Audit information

The multi-invoice summary view displays a table with:

- Invoice ID
- Customer ID and Name
- Date and GL Posting Date
- Amount and Status
- Entity

**Examples:**

```bash
npm run agent "list invoices"
npm run agent "get invoice INV25948"
npm run agent "get invoice 54284"
npm run agent "get invoices INV001, INV002, INV003"
npm run agent "get invoices for customer 28008"
```

### Create Invoices


| Command                                               | Description                          |
| ----------------------------------------------------- | ------------------------------------ |
| `create invoice`                                      | Create 1 invoice using defaults      |
| `create <N> invoices`                                 | Create N invoices                    |
| `create invoice for customer <ID>`                    | Create invoice for specific customer |
| `create invoice customer <ID> gl <ACCOUNT> $<AMOUNT>` | Full specification                   |


The agent uses intelligent learning to discover working combinations of customers, GL accounts, and other parameters.

**Amount Specification:**
- Use `amount X` syntax: `create invoice amount 858.6`
- Use `X dollars` syntax: `create invoice 100 dollars`
- Avoid `$X` in shell (may be interpreted as variable)

**Examples:**

```bash
npm run agent "create invoice"
npm run agent "create 5 invoices"
npm run agent "create invoice for customer 10014"
npm run agent "create invoice customer 10014 gl 4000 amount 250"
npm run agent "create 3 invoices for customer 28008 amount 858.6"
```

---

## Customer Commands

Query and view customer information.

### List Customers


| Command          | Description                |
| ---------------- | -------------------------- |
| `list customers` | List all active customers  |
| `show customers` | Alias for `list customers` |


### Get Customer Details


| Command                  | Description                              |
| ------------------------ | ---------------------------------------- |
| `get customer <ID>`      | Get full customer details by Customer ID |
| `get customer "<Name>"`  | Search customers by name (partial match) |


The customer detail view displays (only non-empty fields):

- Basic information (ID, name, status, entity)
- Terms & billing (terms, currency, credit limit, total due)
- Classification (customer type, GL group, territory, price list)
- Sales representative
- AR accounts
- Payment options (card/ACH enabled)
- Primary contact summary
- Dates (last invoice, created, modified)
- Notes/comments

**Examples:**

```bash
npm run agent "list customers"
npm run agent "get customer 10014"
npm run agent "get customer CUST-001"
npm run agent 'get customer "Acme Corp"'
npm run agent "get customer Smith"
```

When searching by name:
- Returns all customers whose name contains the search term
- Shows a summary table of matching customers
- If only one match, provides a hint to view details

### Get Customer Contacts


| Command                                    | Description               |
| ------------------------------------------ | ------------------------- |
| `get customer <ID> contact`                | View all contact sections |
| `get customer <ID> contact DISPLAYCONTACT` | Primary display contact   |
| `get customer <ID> contact BILLTO`         | Bill-to contact           |
| `get customer <ID> contact SHIPTO`         | Ship-to contact           |
| `get customer <ID> contact CONTACTINFO`    | Contact information       |
| `get customer <ID> contact CONTACTS`       | All entity contacts list  |


Contact sections include:

- Name details (contact name, company, full name)
- Communication (email, phone, cell, fax, website)
- Tax information
- Full mailing address

**Examples:**

```bash
npm run agent "get customer 10014 contact"
npm run agent "get customer 10014 contact BILLTO"
npm run agent "get customer 10014 contact SHIPTO"
```

---

## GL Account Commands

Query general ledger accounts and labels.


| Command         | Description               |
| --------------- | ------------------------- |
| `list accounts` | List GL accounts          |
| `list gl`       | Alias for `list accounts` |
| `show accounts` | Alias for `list accounts` |
| `list labels`   | List account labels       |


**Examples:**

```bash
npm run agent "list accounts"
npm run agent "list labels"
```

---

## Payment Commands

AR Payment operations for paying invoices.

### Pay Invoice


| Command                                | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `pay invoice <INVID>`                  | Pay invoice in full by Invoice ID (e.g., INV25948) |
| `pay invoice <RECORDNO>`               | Pay invoice in full by record number               |
| `pay invoice <INVID> $<N>`             | Partial payment of $N                              |
| `pay invoice <INVID> amount <N>`       | Partial payment (alternative syntax)               |
| `pay invoice <INVID> method <METHOD>`  | Specify payment method                             |
| `pay invoice <INVID> bank <ACCOUNTID>` | Specify bank account                               |


**Payment Methods:** Cash, Check, EFT, ACH, Credit Card

The agent uses intelligent learning to discover working bank accounts and payment methods. When a payment fails due to an invalid account, it automatically tries other available bank accounts.

**Examples:**

```bash
npm run agent "pay invoice INV25948"
npm run agent "pay invoice 54284"
npm run agent "pay invoice INV25948 \$100"
npm run agent "pay invoice INV25948 amount 50"
npm run agent "pay invoice INV25948 method Cash"
npm run agent "pay invoice INV25948 bank BOA"
```

### List Payments


| Command                           | Description                 |
| --------------------------------- | --------------------------- |
| `list payments`                   | List recent AR payments     |
| `list payments for customer <ID>` | Filter payments by customer |


**Examples:**

```bash
npm run agent "list payments"
npm run agent "list payments for customer 10014"
```

### Get Payment Details


| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `get payment <RECORDNO>` | Get payment details by record number |


The payment detail view displays:

- Payment amount and status
- Payment method and date
- Bank account used
- Applied invoices

**Examples:**

```bash
npm run agent "get payment 12345"
```

### List Bank Accounts


| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `list bank accounts` | List available bank/checking accounts |


Use this to discover which bank accounts are available for payments.

**Examples:**

```bash
npm run agent "list bank accounts"
```

### Learning Behavior

The payment system learns from successful and failed attempts:

1. **Bank Account Discovery** - When no bank account is specified, the agent fetches available accounts and tries them
2. **Error Recovery** - If a bank account is invalid, it's marked as "bad" and the agent tries another
3. **Successful Defaults** - After a successful payment, the working bank account becomes the default for future payments
4. **Payment Methods** - If a payment method fails, the agent tries alternatives (Cash, Check, EFT, etc.)

View learned payment defaults:

```bash
npm run agent "show defaults"
```

---

## AR Adjustment Commands

Query and view AR adjustments (advances, debit memos, etc.).

### List Adjustments


| Command                              | Description                           |
| ------------------------------------ | ------------------------------------- |
| `list adjustments`                   | List all AR adjustments               |
| `list adjustments for customer <ID>` | Filter adjustments by customer        |
| `list advances`                      | Alias for `list adjustments`          |


The list view shows:

- Adjustment ID (RECORDID)
- Record Number
- Customer ID and Name
- Date Created
- Amount and Amount Due
- Status (Posted, Paid, etc.)
- Entity

**Examples:**

```bash
npm run agent "list adjustments"
npm run agent "list adjustments for customer 10001"
npm run agent "list advances for customer 28008"
```

### Get Adjustment Details


| Command                      | Description                         |
| ---------------------------- | ----------------------------------- |
| `get adjustment <ID>`        | Get adjustment by Adjustment ID     |
| `get adjustment <RECORDNO>`  | Get adjustment by record number     |


The detail view shows:

- Header (Adjustment ID, Record Number, Status, Description)
- Amounts (Total Entered, Total Paid, Total Due, Currency)
- Customer (Customer ID, Name, Bill To, Ship To)
- Dates (Created, Posted, Paid)
- Entity & Batch information
- Audit trail (Created/Modified by, timestamps)

**Examples:**

```bash
npm run agent "get adjustment ADJ-001"
npm run agent "get adjustment 12345"
npm run agent "get advance 67890"
```

---

## Defaults & Learning Commands

Manage defaults and the agent's learned knowledge.

### View Defaults


| Command         | Description                                |
| --------------- | ------------------------------------------ |
| `show defaults` | Display all defaults and learned knowledge |
| `show memory`   | Alias for `show defaults`                  |


Shows:

- Manual defaults (from `data/defaults.json`)
- Learned working defaults (from successful operations)
- Known bad values (to avoid)
- Successful combinations history

### Set Defaults


| Command                     | Description                   |
| --------------------------- | ----------------------------- |
| `set default customer <ID>` | Set default customer ID       |
| `set default account <NO>`  | Set default GL account number |
| `set default amount <N>`    | Set default invoice amount    |


### Reset Learning


| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `reset knowledge` | Clear all learned knowledge and start fresh |
| `clear knowledge` | Alias for `reset knowledge`                 |
| `reset learning`  | Alias for `reset knowledge`                 |


**Examples:**

```bash
npm run agent "show defaults"
npm run agent "set default customer 10014"
npm run agent "set default account 4000"
npm run agent "set default amount 100"
npm run agent "reset knowledge"
```

---

## Help


| Command | Description             |
| ------- | ----------------------- |
| `help`  | Show available commands |
| `?`     | Alias for `help`        |


```bash
npm run agent "help"
```

---

## Tips

1. **Natural language**: Commands are parsed flexibly. "list customers", "show customers", and "list all customers" all work.
2. **Case insensitive**: Commands work in any case: `GET INVOICE`, `get invoice`, `Get Invoice`.
3. **Learning**: The agent learns from successful operations. After creating an invoice successfully, those parameters become the new defaults.
4. **Debugging**: All XML requests/responses are saved to `outputs/xml/` for debugging.
5. **Empty fields hidden**: Detail views (customer, invoice) only show fields that have values - empty fields are automatically hidden.

