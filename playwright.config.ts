import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:30000,use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',headless:true},webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000}});
