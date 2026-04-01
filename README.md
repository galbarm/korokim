# Korokim

Sends email notifications when detecting new transactions on Israeli bank & credit card companies.

Uses [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers) to periodically fetch transactions, stores them in MongoDB, and sends an email for each new transaction via Nodemailer.

## Prerequisites

- Node.js
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))
- A Gmail account (or other SMTP service) for sending emails

## Setup

1. Copy `config/default-example.ts` to `config/default.ts` and fill in your data:
   - `mongoUrl` — MongoDB connection string
   - `nodemailer` — email service credentials and recipients
   - `accounts` — bank/credit card login credentials
   - `friendlyNames` — human-readable names for account numbers
   - `toIgnore` — transaction descriptions to skip
   - `daysAgo` — how far back to fetch transactions
   - `updateIntervalMin` — minutes between fetch cycles

2. Install dependencies:
   ```
   npm install
   ```

3. Run:
   ```
   npm start
   ```

## Supported Banks & Credit Cards

See [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers#supported-providers) for the full list of supported providers.
