# Sage Intacct Action Agent

A command-line agent that performs real ERP actions in Sage Intacct from natural language commands.

## Features

- **Session Management**: Automatically handles Sage Intacct API sessions
- **Invoice Operations**: Create, read, list invoices
- **Customer Queries**: List and search customers with detailed contact views
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

For the complete command reference, see **[CLI Commands Documentation](docs/CLI_COMMANDS.md)**.

### Quick Reference

```bash
# Session
npm run agent "session"              # Create API session
npm run agent "status"               # Check session status

# List Records
npm run agent "list customers"       # List active customers
npm run agent "list invoices"        # List open invoices
npm run agent "list accounts"        # List GL accounts

# Get Details
npm run agent "get invoice INV25948" # Get invoice by ID
npm run agent "get invoice 54284"    # Get invoice by record number
npm run agent "get customer 10014"   # Get customer details
npm run agent "get customer 10014 contact"        # View all contacts
npm run agent "get customer 10014 contact BILLTO" # View bill-to contact

# Create
npm run agent "create invoice"
npm run agent "create invoice for customer 10014 gl 4000 $250"

# Defaults & Learning
npm run agent "show defaults"        # View defaults & learned knowledge
npm run agent "set default customer 10014"
npm run agent "reset knowledge"      # Clear learned data
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
├── docs/
│   └── CLI_COMMANDS.md     # Full CLI documentation
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

- [ ] Payment CLI commands (pay invoice, apply credits)
- [ ] Get GL account details
- [ ] Playwright dashboard verification
- [ ] More intelligent error recovery
- [ ] LLM-based natural language understanding

## Recently Completed

- [x] Get customer details with full information display
- [x] Get customer contact sections (DISPLAYCONTACT, BILLTO, SHIPTO)
- [x] Smart display that hides empty fields
- [x] CLI documentation (`docs/CLI_COMMANDS.md`)
