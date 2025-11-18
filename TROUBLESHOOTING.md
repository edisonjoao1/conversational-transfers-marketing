# Troubleshooting Guide

This document contains all issues we encountered during development and how we solved them.

---

## Table of Contents
1. [Claude Desktop Issues](#claude-desktop-issues)
2. [Wise API Issues](#wise-api-issues)
3. [Exchange Rate Issues](#exchange-rate-issues)
4. [ChatGPT Integration Issues](#chatgpt-integration-issues)
5. [Build & Environment Issues](#build--environment-issues)

---

## Claude Desktop Issues

### Issue 1: Environment Variables Not Loading

**Symptom:**
```
Server running in DEMO mode despite MODE=PRODUCTION in .env
```

**Root Cause:**
Claude Desktop doesn't reliably load `.env` files when spawning MCP servers.

**Solution:**
Set environment variables directly in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mybambu-claude": {
      "command": "node",
      "args": ["/path/to/dist/server.js"],
      "env": {
        "MODE": "PRODUCTION",
        "WISE_API_KEY": "your-key",
        "WISE_PROFILE_ID": "your-id",
        "WISE_API_URL": "https://api.sandbox.transferwise.tech"
      }
    }
  }
}
```

**Key Insight:** The `"env"` object in the config bypasses `.env` file loading entirely.

---

### Issue 2: Old MCP Server Process Still Running

**Symptom:**
Changes to code or environment not taking effect after rebuild.

**Root Cause:**
Old MCP server process still running with cached environment/code.

**Solution:**
1. Completely quit Claude Desktop (Cmd+Q)
2. Check for orphaned processes:
```bash
ps aux | grep "dist/server.js"
```
3. Kill if found:
```bash
kill <PID>
```
4. Restart Claude Desktop

**Prevention:** Always fully quit and restart Claude Desktop after changes.

---

### Issue 3: MCP Tool Schema Not Updating

**Symptom:**
Added new field to tool schema but Claude doesn't recognize it.

**Root Cause:**
Claude Desktop caches tool schemas.

**Solution:**
1. Rebuild: `npm run build`
2. Quit Claude Desktop completely
3. Restart Claude Desktop
4. Start new conversation (old conversations may use cached schema)

---

## Wise API Issues

### Issue 1: 422 Error - Colombian ID Documents Missing

**Symptom:**
```json
{
  "errors": [
    {
      "code": "NOT_VALID",
      "message": "Please provide a valid ID number",
      "path": "idDocumentNumber"
    }
  ]
}
```

**Root Cause:**
Colombia requires ID document fields that weren't in our initial implementation.

**Solution:**
Add to recipient details:
```typescript
case 'COP':
  recipientDetails = {
    legalType: 'PRIVATE',
    bankCode: 'COLOCOBM',
    accountNumber: params.recipientBankAccount,
    accountType: params.accountType || 'SAVINGS',
    phoneNumber: params.phoneNumber,
    idDocumentType: 'CC', // Cédula de Ciudadanía
    idDocumentNumber: params.idDocumentNumber,
    address: {
      country: 'CO',
      city: params.city,
      firstLine: params.address,
      postCode: params.postCode
    }
  };
```

**Files Changed:**
- `src/services/wise.ts` (added fields to sendMoney)
- `src/services/recipient-fields.ts` (added to Colombia requirements)
- `src/server.ts` (added to MCP tool schema)

**Testing:**
```bash
# Test recipient creation
curl -X POST 'https://api.sandbox.transferwise.tech/v1/accounts' \
  -H 'Authorization: Bearer YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -d @test-colombia.json
```

---

### Issue 2: 403 Error - Funding Transfers

**Symptom:**
```json
{"error":"forbidden"}
```
HTTP 403 when calling `/v3/profiles/{id}/transfers/{id}/payments`

**Root Cause:**
**Personal API tokens cannot fund transfers due to PSD2 regulations.**

**Explanation:**
- Wise sandbox personal tokens can create quotes, recipients, and transfers
- But funding requires OAuth 2.0 credentials or Strong Customer Authentication
- This is a security requirement, not a bug

**Solution:**
1. **For Testing:** Fund transfers manually via Wise sandbox UI
2. **For Production:** Implement OAuth 2.0 flow

**Code Fix:**
Gracefully handle 403 in funding step:
```typescript
try {
  await this.fundTransfer(transfer.id);
  console.log('✅ Transfer funded successfully');
} catch (fundingError: any) {
  if (fundingError.message.includes('403') || fundingError.message.includes('forbidden')) {
    console.log('⚠️  Funding requires OAuth token (personal tokens cannot fund due to PSD2)');
  } else {
    throw fundingError;
  }
}
```

**Reference:** https://docs.wise.com/api-docs/guides/strong-customer-authentication-2fa

---

### Issue 3: customerTransactionId Format Error

**Symptom:**
```json
{"code":"illegal.argument.exception","field":"customerTransactionId"}
```

**Root Cause:**
customerTransactionId must be proper UUID v4 format.

**Solution:**
Use Node's crypto.randomUUID():
```typescript
import { randomUUID } from 'crypto';

const transfer = await wiseService.sendMoney({
  ...
  customerTransactionId: randomUUID(), // Proper UUID v4
  ...
});
```

**Wrong:**
- `customerTransactionId: "test-123"`
- `customerTransactionId: Date.now().toString()`

**Right:**
- `customerTransactionId: "bd244a95-dcf8-4c31-aac8-bf5e2f3e54c0"`

---

## Exchange Rate Issues

### Issue 1: Incorrect Exchange Rate Displayed

**Symptom:**
```
Exchange rate: 4,100 COP per USD
Actual rate: ~3,750 COP per USD
```
~9% error!

**Root Cause:**
Server was using hardcoded exchange rates instead of real Wise API rates:
```typescript
// WRONG: Hardcoded rates
const rate = EXCHANGE_RATES[corridor.currency]; // 4100
const recipientAmount = netAmount * rate;
```

**Solution:**
Use actual rates from Wise quote response:
```typescript
// RIGHT: Real Wise rates
const wiseResult = await wiseService.sendMoney({ amount, ... });
// wiseResult contains:
// - rate: 3757.20 (from Wise)
// - targetAmount: 358249.02 (calculated by Wise)
// - fee: 4.65 (real Wise fee)
```

**Files Changed:**
- `src/server.ts` (removed hardcoded calculations, use wiseResult values)

**Impact:**
Now ALL countries get real-time rates: MXN, COP, BRL, GBP, EUR

---

## ChatGPT Integration Issues

### Issue 1: OpenAI Moderation Blocks Transfers

**Symptom:**
```
I apologize, but I cannot process financial transactions or handle sensitive banking information.
```

**Root Cause:**
OpenAI's moderation system flags requests containing:
- Bank account numbers
- Personal identification numbers
- Financial transaction details

**Status:** 🚧 In Progress

**Attempted Solutions:**

1. **Custom Instructions (Partial Success)**
   - Frame as "demo" or "simulation"
   - Results: Inconsistent, still blocks sometimes

2. **Code Interpreter Mode (Testing)**
   - Run through code interpreter
   - May bypass some content filters
   - Needs testing

3. **Intermediary API (Recommended)**
   - Don't send bank details directly to ChatGPT
   - Use session IDs and references
   - Store sensitive data server-side

**Next Steps:**
- Test with obfuscated data (e.g., "Account ending in ...8952")
- Implement server-side session storage
- Route through webhook that doesn't expose data to ChatGPT

---

## Build & Environment Issues

### Issue 1: dotenv Polluting stdout

**Symptom:**
```
Unexpected token 'd', "[dotenv@17."… is not valid JSON
```

**Root Cause:**
dotenv library outputs to stdout, breaking MCP's JSON-RPC protocol.

**Solution:**
Create custom silent env loader (`src/env.ts`):
```typescript
export function loadEnv() {
  try {
    const envFile = readFileSync('.env', 'utf-8');
    envFile.split('\n').forEach(line => {
      // Parse and set without stdout pollution
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join('=').trim();
      }
    });
    console.error('✅ Loaded env'); // stderr is OK for MCP
  } catch (error) {
    console.error('❌ Error loading .env');
  }
}
```

**Key:** Use `console.error()` not `console.log()` for MCP servers.

---

### Issue 2: TypeScript Build Errors

**Symptom:**
```
error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

**Solution:**
Add proper type guards:
```typescript
// Before
const result = await someFunction(process.env.API_KEY);

// After
if (!process.env.API_KEY) {
  throw new Error('API_KEY not set');
}
const result = await someFunction(process.env.API_KEY);
```

---

## Common Debugging Commands

### Check Environment
```bash
# Check if .env is being read
cat .env

# Check Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Check running processes
ps aux | grep node
```

### Test Wise API Directly
```bash
# Get profile
curl -H "Authorization: Bearer YOUR_KEY" \
  https://api.sandbox.transferwise.tech/v2/profiles/YOUR_PROFILE_ID

# Create quote
curl -X POST https://api.sandbox.transferwise.tech/v2/quotes \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sourceCurrency":"USD","targetCurrency":"COP","sourceAmount":100,"profile":YOUR_PROFILE_ID}'

# Test full flow
./test-wise-transfer.sh
```

### Check Logs
```bash
# Claude Desktop logs (if available)
# Usually in ~/Library/Logs/Claude/

# MCP server logs (stderr)
# Visible in Claude Desktop developer tools (if enabled)
```

---

## Best Practices We Learned

1. **Always Set Env Vars in Claude Config**
   - Don't rely on `.env` files for Claude Desktop
   - Set directly in `claude_desktop_config.json`

2. **Test Wise API Independently First**
   - Before debugging MCP/Claude, test Wise API directly
   - Use curl or test scripts

3. **Check Wise Sandbox Dashboard**
   - Transfers show up even if funding fails
   - Useful for debugging

4. **Use stderr for Logging in MCP**
   - `console.error()` is safe for MCP
   - `console.log()` breaks JSON-RPC protocol

5. **Restart Claude Completely**
   - Cmd+Q to fully quit
   - Not just close window
   - Check for orphaned processes

6. **Country-Specific Requirements**
   - Always check Wise API docs for each country
   - Requirements change (Colombia now needs ID, didn't before)
   - Test with real API calls

7. **Personal Token Limitations**
   - Can't fund transfers (PSD2)
   - Still useful for testing transfer creation
   - Plan for OAuth in production

---

## Quick Reference: What Works & What Doesn't

### ✅ Works

- Creating quotes (real-time rates)
- Creating recipients (all 5 countries)
- Creating transfers
- Validating bank details
- Natural conversation flow
- MCP protocol with Claude Desktop
- Multiple countries
- Real-time exchange rates

### ⚠️ Works With Limitations

- **Funding transfers**: Requires manual action or OAuth
- **ChatGPT integration**: OpenAI moderation blocks sometimes
- **Personal tokens**: Can't fund, but transfers still created

### ❌ Doesn't Work

- Auto-funding with personal tokens (PSD2 restriction)
- ChatGPT with raw bank account numbers (moderation)
- `.env` files in Claude Desktop (use config instead)

---

## Getting Help

If you encounter an issue not listed here:

1. Check Wise API documentation
2. Test Wise API directly (bypass MCP)
3. Check Claude Desktop config
4. Verify environment variables
5. Check for orphaned processes
6. Try with fresh Claude conversation
7. Check Wise sandbox dashboard

---

**Last Updated:** November 2025
**Version:** 1.0.0
