#!/usr/bin/env node

/**
 * MyBambu MCP Server for Claude Desktop & WhatsApp
 *
 * Standard MCP protocol implementation with Wise API integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadEnv } from './env.js';
import { WiseService, initializeWiseService, getWiseService } from './services/wise.js';
import { getBankRequirements, validateBankDetails } from './services/recipient-fields.js';

// Load environment variables silently (no stdout pollution for MCP stdio protocol)
loadEnv();

// Initialize Wise service
const WISE_API_KEY = process.env.WISE_API_KEY || '';
const WISE_PROFILE_ID = process.env.WISE_PROFILE_ID || '';
const WISE_API_URL = process.env.WISE_API_URL || 'https://api.sandbox.transferwise.tech';
const MODE = process.env.MODE || 'DEMO';

console.error('🚀 Initializing MyBambu MCP Server');
console.error(`📍 Mode: ${MODE} (from env: ${process.env.MODE || 'undefined'})`);
console.error(`🌐 Wise API: ${WISE_API_URL}`);
console.error(`🔑 API Key present: ${WISE_API_KEY ? 'Yes' : 'No'}`);

if (MODE === 'PRODUCTION' && WISE_API_KEY) {
  initializeWiseService({
    apiKey: WISE_API_KEY,
    profileId: WISE_PROFILE_ID,
    apiUrl: WISE_API_URL
  });
  console.error('✅ Wise service initialized');
}

// Supported transfer corridors
const TRANSFER_CORRIDORS = {
  'Mexico': { currency: 'MXN', deliveryTime: '1-2 business days', minAmount: 10, maxAmount: 10000 },
  'Colombia': { currency: 'COP', deliveryTime: '1-3 business days', minAmount: 10, maxAmount: 10000 },
  'Brazil': { currency: 'BRL', deliveryTime: '1-3 business days', minAmount: 10, maxAmount: 10000 },
  'United Kingdom': { currency: 'GBP', deliveryTime: 'Same day', minAmount: 10, maxAmount: 10000 },
  'Europe': { currency: 'EUR', deliveryTime: '1 business day', minAmount: 10, maxAmount: 10000 }
};

// Exchange rates (demo/fallback only - production uses real Wise rates)
const EXCHANGE_RATES: Record<string, number> = {
  'MXN': 17.2,
  'COP': 3750, // Updated to reflect current rate (~3,744-3,789 as of Nov 2025)
  'BRL': 5.1,
  'GBP': 0.79,
  'EUR': 0.92
};

// Create MCP server
const server = new Server(
  {
    name: 'mybambu-transfers',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_exchange_rate',
        description: 'Get current exchange rate for USD to target currency',
        inputSchema: {
          type: 'object',
          properties: {
            target_currency: {
              type: 'string',
              description: 'Target currency code (MXN, COP, BRL, GBP, EUR)',
              enum: ['MXN', 'COP', 'BRL', 'GBP', 'EUR']
            }
          },
          required: ['target_currency']
        }
      },
      {
        name: 'get_supported_countries',
        description: 'Get list of countries where we can send money',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'send_money',
        description: 'Send money internationally via Wise. Collects recipient bank details naturally through conversation. IMPORTANT: If bank details are missing, ask user for them, then call this tool again WITH bank_details parameter.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'Amount in USD to send'
            },
            to_country: {
              type: 'string',
              description: 'Destination country name'
            },
            recipient_name: {
              type: 'string',
              description: 'Full name of recipient'
            },
            bank_details: {
              type: 'object',
              description: 'Recipient bank account details (varies by country)',
              properties: {
                clabe: { type: 'string', description: 'Mexican CLABE (18 digits)' },
                iban: { type: 'string', description: 'European IBAN' },
                sortCode: { type: 'string', description: 'UK sort code (6 digits)' },
                accountNumber: { type: 'string', description: 'Bank account number' },
                cpf: { type: 'string', description: 'Brazilian CPF (11 digits)' },
                bankCode: { type: 'string', description: 'Bank code' },
                accountType: { type: 'string', description: 'CURRENT or SAVINGS' },
                phoneNumber: { type: 'string', description: 'Phone number (for Colombia)' },
                idDocumentNumber: { type: 'string', description: 'Colombian Cédula number (national ID)' },
                address: { type: 'string', description: 'Street address (for Colombia)' },
                city: { type: 'string', description: 'City (for Colombia)' },
                postCode: { type: 'string', description: 'Postal code (for Colombia)' }
              }
            }
          },
          required: ['amount', 'to_country', 'recipient_name']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_exchange_rate': {
        const { target_currency } = args as { target_currency: string };
        const rate = EXCHANGE_RATES[target_currency];

        if (!rate) {
          throw new Error(`Unsupported currency: ${target_currency}`);
        }

        return {
          content: [{
            type: 'text',
            text: `Current exchange rate: 1 USD = ${rate} ${target_currency}`
          }]
        };
      }

      case 'get_supported_countries': {
        const countries = Object.entries(TRANSFER_CORRIDORS).map(([country, info]) => {
          return `• ${country} (${info.currency}) - ${info.deliveryTime}`;
        }).join('\n');

        return {
          content: [{
            type: 'text',
            text: `We support transfers to:\n\n${countries}`
          }]
        };
      }

      case 'send_money': {
        const { amount, to_country, recipient_name, bank_details = {} } = args as {
          amount: number;
          to_country: string;
          recipient_name: string;
          bank_details?: Record<string, any>;
        };

        // Find corridor
        const corridor = TRANSFER_CORRIDORS[to_country as keyof typeof TRANSFER_CORRIDORS];
        if (!corridor) {
          return {
            content: [{
              type: 'text',
              text: `❌ Sorry, we don't support transfers to ${to_country} yet.\n\nSupported countries: ${Object.keys(TRANSFER_CORRIDORS).join(', ')}`
            }]
          };
        }

        // Validate amount
        if (amount < corridor.minAmount || amount > corridor.maxAmount) {
          return {
            content: [{
              type: 'text',
              text: `❌ Amount must be between $${corridor.minAmount} and $${corridor.maxAmount} USD for ${to_country}`
            }]
          };
        }

        // Check if bank details are needed
        const useRealAPI = MODE === 'PRODUCTION' && WISE_API_KEY;

        if (useRealAPI) {
          const requirements = getBankRequirements(corridor.currency);

          if (requirements) {
            const validation = validateBankDetails(corridor.currency, bank_details);

            if (!validation.valid) {
              // Ask for bank details
              return {
                content: [{
                  type: 'text',
                  text: `📝 To complete this $${amount} transfer to ${recipient_name} in ${to_country}, I need their bank details:\n\n${requirements.instructions}\n\n**Required fields:**\n${requirements.fields.map(f => `• **${f.label}**: ${f.description}\n  Example: ${f.example}`).join('\n\n')}\n\n**Once you provide these, I'll process the transfer immediately.**`
                }],
                isError: false
              };
            }
          }
        }

        // Process transfer (real or demo)
        if (useRealAPI) {
          try {
            console.error('💸 Processing REAL transfer via Wise...');
            const wiseService = getWiseService();

            // Extract bank details
            let recipientBankAccount = '';
            let recipientBankCode = '';
            let extraFields: any = {};

            switch (corridor.currency) {
              case 'MXN':
                recipientBankAccount = bank_details.clabe || '';
                break;
              case 'GBP':
                recipientBankAccount = bank_details.accountNumber || '';
                recipientBankCode = bank_details.sortCode || '';
                break;
              case 'BRL':
                recipientBankAccount = bank_details.accountNumber || '';
                recipientBankCode = bank_details.cpf || '';
                break;
              case 'EUR':
                recipientBankAccount = bank_details.iban || '';
                break;
              case 'COP':
                recipientBankAccount = bank_details.accountNumber || '';
                extraFields = {
                  accountType: bank_details.accountType || 'SAVINGS',
                  phoneNumber: bank_details.phoneNumber,
                  idDocumentNumber: bank_details.idDocumentNumber,
                  address: bank_details.address,
                  city: bank_details.city,
                  postCode: bank_details.postCode
                };
                break;
            }

            const wiseResult = await wiseService.sendMoney({
              amount: amount,
              recipientName: recipient_name,
              recipientCountry: to_country,
              recipientBankAccount,
              recipientBankCode,
              targetCurrency: corridor.currency,
              reference: `MyBambu transfer to ${recipient_name}`,
              ...extraFields
            });

            console.error('✅ REAL transfer created:', wiseResult.transferId);

            return {
              content: [{
                type: 'text',
                text: `✅ **Transfer Completed!**\n\n` +
                      `💰 You sent: $${amount} USD\n` +
                      `📩 ${recipient_name} receives: ${wiseResult.targetAmount.toFixed(2)} ${corridor.currency}\n` +
                      `💱 Exchange rate: ${wiseResult.rate.toFixed(2)} ${corridor.currency} per USD\n` +
                      `💵 Wise fee: $${wiseResult.fee.toFixed(2)} USD\n` +
                      `⏱️  Estimated delivery: ${wiseResult.estimatedDelivery || corridor.deliveryTime}\n` +
                      `🆔 Transfer ID: ${wiseResult.transferId}\n\n` +
                      `✨ Real transfer processed via Wise API`
              }]
            };

          } catch (error: any) {
            console.error('❌ Wise API error:', error.message);

            // Fall back to demo with estimated values
            const rate = EXCHANGE_RATES[corridor.currency];
            const feePercentage = 0.03;
            const feeAmount = amount * feePercentage;
            const netAmount = amount - feeAmount;
            const recipientAmount = netAmount * rate;

            return {
              content: [{
                type: 'text',
                text: `⚠️ **Transfer Simulated (Wise API Error)**\n\n` +
                      `💰 You sent: $${amount} USD\n` +
                      `📩 ${recipient_name} receives: ~${recipientAmount.toFixed(2)} ${corridor.currency}\n` +
                      `💱 Exchange rate: ~${rate} (estimated)\n` +
                      `💵 Fee: ~$${feeAmount.toFixed(2)}\n` +
                      `⏱️  Estimated delivery: ${corridor.deliveryTime}\n\n` +
                      `ℹ️ Wise API error: ${error.message}\n` +
                      `This was a simulated transfer. No real money was sent.`
              }]
            };
          }
        } else {
          // Demo mode - use hardcoded rates
          console.error('🎭 Processing DEMO transfer...');

          const rate = EXCHANGE_RATES[corridor.currency];
          const feePercentage = 0.03;
          const feeAmount = amount * feePercentage;
          const netAmount = amount - feeAmount;
          const recipientAmount = netAmount * rate;

          return {
            content: [{
              type: 'text',
              text: `✅ **Transfer Demo**\n\n` +
                    `💰 You sent: $${amount} USD\n` +
                    `📩 ${recipient_name} receives: ~${recipientAmount.toFixed(2)} ${corridor.currency}\n` +
                    `💱 Exchange rate: ~${rate} (estimated)\n` +
                    `💵 Fee: ~$${feeAmount.toFixed(2)}\n` +
                    `⏱️  Estimated delivery: ${corridor.deliveryTime}\n\n` +
                    `🎭 This is a demo. No real money was sent.\n` +
                    `Set MODE=PRODUCTION to enable real transfers.`
            }]
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error('❌ Tool error:', error.message);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
