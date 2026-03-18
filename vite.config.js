import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

function copyRuntimeStaticAssets() {
  const dirsToCopy = ['assets', 'img'];

  return {
    name: 'copy-runtime-static-assets',
    closeBundle() {
      const projectRoot = process.cwd();
      const outputRoot = path.resolve(projectRoot, 'dist');

      for (const relDir of dirsToCopy) {
        const sourceDir = path.resolve(projectRoot, relDir);
        const targetDir = path.resolve(outputRoot, relDir);

        if (!existsSync(sourceDir)) continue;

        cpSync(sourceDir, targetDir, {
          recursive: true,
          force: true
        });
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [copyRuntimeStaticAssets()]
});
