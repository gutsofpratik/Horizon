import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const desktop=process.env.OPENCLAUDE_EDITION==='desktop';
export default defineConfig({define:{'import.meta.env.VITE_OPENCLAUDE_EDITION':JSON.stringify(desktop?'desktop':'web')},base:desktop?'/desktop/':'/',resolve:{alias:{'#desktop-ui':resolve(desktop?'src/desktop/ui.tsx':'src/platform/web-ui.tsx')}},build:{outDir:desktop?'dist-desktop':'dist'},plugins:[react(),{name:'openclaude-edition',transformIndexHtml:{order:'pre',handler(html){return desktop?html.replace('/src/main.tsx','/src/desktop/main.tsx'):html;}}}],server:{port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3001',changeOrigin:false}}}});

