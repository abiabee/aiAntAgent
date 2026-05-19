# Sage Intacct Action Agent

A command-line agent that performs real ERP actions in Sage Intacct from natural language commands.

## Features

- **Session Management**: Automatically handles Sage Intacct API sessions
- **Invoice Operations**: Create, read, list invoices
- **Customer Queries**: List and search customers
- **GL Account Queries**: List GL accounts and account labels
- **Learning Memory**: Remembers which combinations work in your sandbox
- **XML Logging**: All requests/responses saved for debugging

## Quick Start

1. **Install dependencies**:
  ```bash
   npm install
  ```
2. **Configure credentials**:
  ```bash
   cp .env.example .env
   # Edit .env with your Sage Intacct credentials
  ```
3. **Run commands**:
  ```bash
   # Create a session (tests connectivity)
   npm run agent "session"

   # List customers
   npm run agent "list customers"

   # List GL accounts
   npm run agent "list accounts"

   # Create an invoice
   npm run agent "create invoice for customer CUST-001 gl 4000"
  ```

## Commands

### Session & Status

```bash
npm run agent "session"     # Create new API session
npm run agent "status"      # Check current session
```

### List Records

```bash
npm run agent "list customers"   # List active customers
npm run agent "list invoices"    # List open invoices
npm run agent "list accounts"    # List GL accounts
npm run agent "list labels"      # List account labels
```

### Get Specific Records

```bash
npm run agent "get invoice 12345"      # Get invoice by record number
npm run agent "get customer CUST-001"  # Get customer by ID
```

### Create Invoices

```bash
npm run agent "create invoice"
npm run agent "create 5 invoices"
npm run agent "create invoice for customer CUST-001"
npm run agent "create invoice customer TEST-001 gl 4000 $250"
```

### Defaults & Memory

```bash
npm run agent "show defaults"              # View current defaults
npm run agent "set default customer X"     # Set default customer
npm run agent "set default account 4000"   # Set default GL account
npm run agent "set default amount 100"     # Set default amount
```

## Environment Variables


| Variable               | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `SAGE_SENDER_ID`       | Web Services sender ID                         |
| `SAGE_SENDER_PASSWORD` | Web Services sender password                   |
| `SAGE_COMPANY_ID`      | Your company ID                                |
| `SAGE_USER_ID`         | API user ID                                    |
| `SAGE_USER_PASSWORD`   | API user password                              |
| `SAGE_LOCATION_ID`     | (Optional) Entity/location ID for multi-entity |


## Project Structure

```
sage-agent/
├── src/
│   ├── cli.ts              # Entry point & command parser
│   ├── sage/
│   │   ├── client.ts       # Sage API client
│   │   ├── parser.ts       # XML response parser
│   │   ├── templates/      # XML request templates
│   │   └── actions/        # High-level operations
│   ├── memory/
│   │   └── store.ts        # Learning memory
│   └── output/
│       └── table.ts        # Console formatting
├── data/
│   ├── defaults.json       # User-configured defaults
│   └── memory.json         # Learned combinations
├── outputs/
│   ├── xml/                # Request/response logs
│   └── screenshots/        # (Future) Dashboard screenshots
└── .env                    # Credentials (not in git)
```

## Learning Feature

The agent learns which combinations of customers, GL accounts, and locations work together. When a combination succeeds, it's recorded and prioritized for future use. When it fails, the error is logged to avoid repeating the same mistake.

View learned combinations:

```bash
npm run agent "show defaults"
```

## Roadmap

- Payment operations (pay invoice, apply credits)
- Playwright dashboard verification
- More intelligent error recovery
- LLM-based natural language understanding





## Todo:

1. Get account details
2. Get customer details

