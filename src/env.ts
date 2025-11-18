/**
 * Silent environment variable loader
 * Reads .env without polluting stdout (critical for MCP stdio protocol)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnv() {
  try {
    // Try multiple possible .env locations
    const possiblePaths = [
      resolve(process.cwd(), '.env'),
      resolve('/Users/edisonespinosa/mybambu-claude-whatsapp', '.env'),
      resolve(__dirname, '..', '.env')
    ];

    let envFile = '';
    let loadedFrom = '';

    for (const envPath of possiblePaths) {
      try {
        envFile = readFileSync(envPath, 'utf-8');
        loadedFrom = envPath;
        break;
      } catch {
        continue;
      }
    }

    if (!envFile) {
      console.error('⚠️  No .env file found in any expected location');
      return;
    }

    console.error(`📄 Loaded .env from: ${loadedFrom}`);

    // Parse .env file
    let loadedCount = 0;
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) return;

      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
          loadedCount++;
          if (key === 'MODE') {
            console.error(`✅ Set MODE=${value}`);
          }
        }
      }
    });

    console.error(`📥 Loaded ${loadedCount} environment variables`);
  } catch (error: any) {
    console.error(`❌ Error loading .env: ${error.message}`);
  }
}
