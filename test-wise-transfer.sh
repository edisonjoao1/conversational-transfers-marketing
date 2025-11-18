#!/bin/bash

API_KEY="1624cba2-cdfa-424f-91d8-787a5225d52e"
PROFILE_ID="29182377"
BASE_URL="https://api.sandbox.transferwise.tech"
RECIPIENT_ID="701805920"

echo "Step 1: Creating quote..."
QUOTE_RESPONSE=$(curl -s -X POST "${BASE_URL}/v2/quotes" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceCurrency": "USD",
    "targetCurrency": "COP",
    "sourceAmount": 97,
    "targetAmount": null,
    "profile": '${PROFILE_ID}'
  }')

QUOTE_ID=$(echo "$QUOTE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Quote ID: $QUOTE_ID"

UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "UUID: $UUID"

echo -e "\nStep 2: Creating transfer..."
TRANSFER_RESPONSE=$(curl -s -X POST "${BASE_URL}/v1/transfers" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "targetAccount": '${RECIPIENT_ID}',
    "quoteUuid": "'${QUOTE_ID}'",
    "customerTransactionId": "'${UUID}'",
    "details": {
      "reference": "MyBambu Transfer",
      "sourceOfFunds": "verification.source.of.funds.other"
    }
  }')

echo "$TRANSFER_RESPONSE" | python3 -m json.tool || echo "$TRANSFER_RESPONSE"

TRANSFER_ID=$(echo "$TRANSFER_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ ! -z "$TRANSFER_ID" ]; then
  echo -e "\nTransfer ID: $TRANSFER_ID"

  echo -e "\nStep 3: Funding transfer..."
  FUNDING_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/v3/profiles/${PROFILE_ID}/transfers/${TRANSFER_ID}/payments" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"type": "BALANCE"}')

  HTTP_STATUS=$(echo "$FUNDING_RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
  BODY=$(echo "$FUNDING_RESPONSE" | sed '/HTTP_STATUS/d')

  echo "HTTP Status: $HTTP_STATUS"
  echo "Response: $BODY" | python3 -m json.tool || echo "$BODY"
else
  echo "Failed to create transfer"
fi
