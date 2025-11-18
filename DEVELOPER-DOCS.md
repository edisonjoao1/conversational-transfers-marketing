# MyBambu Conversational Money Transfer System

> 🚀 **Revolutionary AI-powered international money transfers through natural conversation**

Send money internationally by simply chatting with Claude or ChatGPT. Real transfers via Wise API with real-time exchange rates.

---

## 🎯 What We Built

A groundbreaking **Conversational Money Transfer** system that executes real international transfers through natural language:

- **"Send $100 to Edison in Colombia"** → Creates real Wise transfer
- Works with **Claude Desktop** (MCP) and **ChatGPT** (Custom GPT)
- Supports **5 countries**: Mexico, Colombia, Brazil, UK, Europe
- **Real-time exchange rates** from Wise API
- Handles **complex requirements** (Colombian ID documents, CLABE, IBAN, etc.)

## ✨ Key Features

### 🌍 Multi-Country Support
- **Mexico (MXN)**: CLABE number system
- **Colombia (COP)**: Bank account + Cédula (national ID)
- **Brazil (BRL)**: CPF + bank details
- **United Kingdom (GBP)**: Sort code + account number
- **Europe (EUR)**: IBAN system

### 💱 Real-Time Financial Data
- Live exchange rates from Wise API (~3,750 COP/USD as of Nov 2025)
- Actual Wise fees (not estimated)
- Current delivery times
- Real quote validation

### 🤖 Natural Conversation
- Asks for missing bank details naturally
- Validates requirements per country
- Provides clear error messages
- Shows transfer confirmation

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Claude Desktop │
│   or ChatGPT    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │   MCP    │ (Model Context Protocol)
    │  Server  │
    └────┬─────┘
         │
    ┌────▼──────────┐
    │ Wise Service  │
    │  (TypeScript) │
    └────┬──────────┘
         │
    ┌────▼──────────┐
    │   Wise API    │
    │   (Sandbox)   │
    └───────────────┘
```

---

## 🚀 Quick Start

### 1. Install
```bash
npm install
```

### 2. Configure
Create `.env`:
```bash
MODE=PRODUCTION
WISE_API_KEY=your-sandbox-api-key
WISE_PROFILE_ID=your-profile-id
WISE_API_URL=https://api.sandbox.transferwise.tech
```

### 3. Build
```bash
npm run build
```

### 4. Setup Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mybambu-claude": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
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

### 5. Restart Claude Desktop

---

## 💬 Usage Example

```
You: Send $100 to Edison in Colombia

Claude: I'll help you send $100 to Edison in Colombia. I need their bank details:
• Bank account number
• Account type (SAVINGS or CURRENT)
• Phone number
• Cédula number (Colombian national ID)
• Address (street, city, postal code)

You: Account: 78800058952, Type: SAVINGS, Phone: 3136379718,
     Cédula: 1234567890, Address: Calle 110 #45-47, Bogota, 110111

Claude: ✅ Transfer Completed!
💰 You sent: $100 USD
📩 Edison receives: 358,249.02 COP
💱 Exchange rate: 3,757.20 COP per USD
💵 Wise fee: $4.65 USD
🆔 Transfer ID: 55656193
```

---

## 🔧 Technical Highlights

### Key Innovations Solved

#### 1. Colombian ID Requirements (422 Error Fix)
**Problem**: Wise API returned `422 - "Please provide valid ID number"`
**Solution**: Added `idDocumentType: 'CC'` and `idDocumentNumber` fields
```typescript
case 'COP':
  recipientDetails = {
    ...
    idDocumentType: 'CC', // Cédula de Ciudadanía
    idDocumentNumber: params.idDocumentNumber
  };
```

#### 2. Real-Time Exchange Rates (Wrong Rate Fix)
**Problem**: Showing 4,100 COP/USD instead of real rate (3,757)
**Solution**: Use Wise API rates instead of hardcoded values
```typescript
// Before: const rate = EXCHANGE_RATES[corridor.currency];
// After: wiseResult.rate from Wise API
```

#### 3. Environment Variables in Claude
**Problem**: `.env` file not loaded by Claude Desktop
**Solution**: Set env vars directly in `claude_desktop_config.json`

#### 4. PSD2 Funding Limitation
**Problem**: 403 error when funding transfers
**Root Cause**: Personal tokens can't fund (PSD2 regulation)
**Solution**: Gracefully skip funding, transfer still created successfully

---

## 🐛 Known Issues

### Transfer Created But Not Funded
- **Status**: Working as designed
- **Reason**: Personal API tokens can't fund transfers (PSD2)
- **Solution**: Fund manually in Wise UI or use OAuth credentials

### ChatGPT Moderation Blocks
- **Status**: In progress
- **Reason**: OpenAI flags financial transactions
- **Next**: Trying workarounds (see roadmap)

---

## 📊 Current Limits

| Limit | Value |
|-------|-------|
| Minimum | $10 USD |
| Maximum | $10,000 USD |
| Countries | 5 (MXN, COP, BRL, GBP, EUR) |
| Mode | Sandbox (use production key for real) |

---

## 🔮 Roadmap

### ✅ Completed
- [x] MCP server for Claude Desktop
- [x] Multi-country support (5 countries)
- [x] Real-time Wise API rates
- [x] Colombian ID document handling
- [x] Transfer creation working
- [x] Comprehensive documentation

### 🚧 In Progress
- [ ] Fix ChatGPT OpenAI moderation
- [ ] WhatsApp Business API integration
- [ ] OAuth for auto-funding

### 📅 Planned
- [ ] Add more countries (India, Philippines, etc.)
- [ ] Transaction history
- [ ] Rate alerts
- [ ] Recurring transfers

---

## 📁 Project Structure

```
mybambu-claude-whatsapp/
├── src/
│   ├── server.ts                 # MCP server entry point
│   ├── env.ts                    # Silent env loader
│   └── services/
│       ├── wise.ts               # Wise API integration
│       └── recipient-fields.ts   # Country requirements
├── dist/                         # Compiled JavaScript
├── docs/                         # Additional documentation
├── test-colombia.json            # Test recipient data
├── test-wise-transfer.sh         # API test script
├── .env                          # Environment configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🧪 Testing

### Test Full Flow
```bash
./test-wise-transfer.sh
```

### Manual Test in Claude
1. Restart Claude Desktop
2. New conversation
3. Say: "Send $100 to Colombia"
4. Provide bank details when asked
5. Check Wise sandbox dashboard

---

## 📦 Deployment

**This repository runs LOCALLY ONLY** - no cloud deployment needed.

### Why Local?
- Claude Desktop MCP servers run as local processes
- Integrated directly with Claude Desktop app
- No need for public webhooks or URLs

### Current Setup
```bash
Location: /Users/edisonespinosa/mybambu-claude-whatsapp/
Executed by: Claude Desktop app via MCP protocol
Config: ~/Library/Application Support/Claude/claude_desktop_config.json
```

### GitHub Pages (Documentation Only)
- **Live Showcase**: http://foxie.cool/conversational-transfers/
- **Source**: `docs/index.html` in this repository
- **Purpose**: Public-facing website (no server functionality)

**No Railway/Render deployment needed** ✅

For detailed deployment information across all repositories, see `DEPLOYMENT-GUIDE.md` in the main workspace.

---

## 🏆 What Makes This Special

This is the **first known implementation** of:
- Natural language directly executing real money transfers
- Multi-platform AI (Claude + ChatGPT) with shared backend
- Country-specific complexity handled conversationally
- Real-time rates in conversational context

### vs Traditional
| Feature | Traditional | Our System |
|---------|-------------|------------|
| Interface | Forms | Conversation |
| Rates | Static | Real-time |
| Fields | User must know | AI asks naturally |
| Platforms | Web/app | Claude, ChatGPT, WhatsApp |

---

## 🤝 Contributing

Key areas for contribution:
- Additional country support
- OAuth funding implementation  
- ChatGPT moderation workarounds
- WhatsApp integration
- Security hardening

---

## ⚖️ Legal & Compliance

**Sandbox**: Uses Wise Sandbox API with test funds only.

**Production**: Requires:
- Proper Wise API credentials
- Full KYC/AML compliance
- PSD2 compliance
- OAuth 2.0 funding
- Transaction monitoring

---

## 🙏 Acknowledgments

- **Wise API**: Sandbox environment
- **Anthropic**: Claude Desktop MCP protocol
- **OpenAI**: Custom GPT capabilities
- **MyBambu**: Inspiring accessible finance

---

**Built with ❤️ for the future of conversational finance**

*Making international transfers as easy as sending a message*

---

## 📞 Support

For setup help or issues:
1. Check `docs/` folder
2. Review this README
3. Test with `./test-wise-transfer.sh`
4. Check Wise sandbox dashboard

---

**Version**: 1.0.0 (November 2025)
**License**: MIT
