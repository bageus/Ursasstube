import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const walletConnectPackagePath = path.join(projectRoot, 'node_modules', '@walletconnect', 'ethereum-provider');
const walletConnectFallbackPath = path.join(projectRoot, 'vendor', 'walletconnect-ethereum-provider', 'index.js');
const shouldUseWalletConnectFallback = !fs.existsSync(walletConnectPackagePath);

export default defineConfig({
  base: './',
  resolve: shouldUseWalletConnectFallback
    ? {
        alias: {
          '@walletconnect/ethereum-provider': walletConnectFallbackPath
        }
      }
    : undefined
});
