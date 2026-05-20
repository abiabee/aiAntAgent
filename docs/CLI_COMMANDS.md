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

| Command | Description |
|---------|-------------|
| `session` | Create a new API session and test connectivity |
| `connect` | Alias for `session` |
| `login` | Alias for `session` |
| `status` | Display current session status (active, age, endpoint) |

**Examples:**

```bash
npm run agent "session"
npm run agent "status"
```

---

## Invoice Commands

Work with AR (Accounts Receivable) invoices.

### List Invoices

| Command | Description |
|---------|-------------|
| `list invoices` | List all open invoices (Posted or Partially Paid) |
| `show invoices` | Alias for `list invoices` |

### Get Invoice Details

| Command | Description |
|---------|-------------|
| `get invoice <ID>` | Get invoice by Invoice ID (e.g., INV25948) |
| `get invoice <RECORDNO>` | Get invoice by record number (e.g., 54284) |

The invoice detail view displays:
- Header metrics (dates, amounts, state)
- Transaction details (customer, bill-to, ship-to)
- Terms & dates
- Integration fields (Paystand UUID, tokens)
- Line items with GL accounts
- Audit information

**Examples:**

```bash
npm run agent "list invoices"
npm run agent "get invoice INV25948"
npm run agent "get invoice 54284"
```

### Create Invoices

| Command | Description |
|---------|-------------|
| `create invoice` | Create 1 invoice using defaults |
| `create <N> invoices` | Create N invoices |
| `create invoice for customer <ID>` | Create invoice for specific customer |
| `create invoice customer <ID> gl <ACCOUNT> $<AMOUNT>` | Full specification |

The agent uses intelligent learning to discover working combinations of customers, GL accounts, and other parameters.

**Examples:**

```bash
npm run agent "create invoice"
npm run agent "create 5 invoices"
npm run agent "create invoice for customer 10014"
npm run agent "create invoice customer 10014 gl 4000 $250"
```

---

## Customer Commands

Query and view customer information.

### List Customers

| Command | Description |
|---------|-------------|
| `list customers` | List all active customers |
| `show customers` | Alias for `list customers` |

### Get Customer Details

| Command | Description |
|---------|-------------|
| `get customer <ID>` | Get full customer details by Customer ID |

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
```

### Get Customer Contacts

| Command | Description |
|---------|-------------|
| `get customer <ID> contact` | View all contact sections |
| `get customer <ID> contact DISPLAYCONTACT` | Primary display contact |
| `get customer <ID> contact BILLTO` | Bill-to contact |
| `get customer <ID> contact SHIPTO` | Ship-to contact |
| `get customer <ID> contact CONTACTINFO` | Contact information |
| `get customer <ID> contact CONTACTS` | All entity contacts list |

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

| Command | Description |
|---------|-------------|
| `list accounts` | List GL accounts |
| `list gl` | Alias for `list accounts` |
| `show accounts` | Alias for `list accounts` |
| `list labels` | List account labels |

**Examples:**

```bash
npm run agent "list accounts"
npm run agent "list labels"
```

---

## Payment Commands

> **Status:** Templates available, CLI commands coming soon.

AR Payment operations for paying invoices.

### Planned Commands

| Command | Description |
|---------|-------------|
| `list payments` | List AR payments |
| `get payment <RECORDNO>` | Get payment details |
| `create payment` | Create a new AR payment |
| `reverse payment <RECORDNO>` | Reverse an AR payment |

### Available Templates

The following payment templates are ready for use:
- `createArPaymentTemplate` - Create AR payments
- `queryArPaymentsTemplate` - Query AR payments
- `readArPaymentTemplate` - Read payment details
- `reverseArPaymentTemplate` - Reverse payments

---

## Defaults & Learning Commands

Manage defaults and the agent's learned knowledge.

### View Defaults

| Command | Description |
|---------|-------------|
| `show defaults` | Display all defaults and learned knowledge |
| `show memory` | Alias for `show defaults` |

Shows:
- Manual defaults (from `data/defaults.json`)
- Learned working defaults (from successful operations)
- Known bad values (to avoid)
- Successful combinations history

### Set Defaults

| Command | Description |
|---------|-------------|
| `set default customer <ID>` | Set default customer ID |
| `set default account <NO>` | Set default GL account number |
| `set default amount <N>` | Set default invoice amount |

### Reset Learning

| Command | Description |
|---------|-------------|
| `reset knowledge` | Clear all learned knowledge and start fresh |
| `clear knowledge` | Alias for `reset knowledge` |
| `reset learning` | Alias for `reset knowledge` |

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

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `?` | Alias for `help` |

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
