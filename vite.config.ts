import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Single source of truth for the version shown in the UI, so the Snap and
// Microsoft Store builds always display the version they were packaged with.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
    plugins: [react()],
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src/renderer'),
        },
    },
    server: {
        port: 5173,
    },
});
