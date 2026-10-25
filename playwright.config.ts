import {defineConfig} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HORIZON_BROWSER_TEST_TOKEN??=randomBytes(32).toString('hex');
process.env.HORIZON_BROWSER_TEST_DIRECTORY??=mkdtempSync(join(tmpdir(),'horizon-browser-tests-'));
export default defineConfig({testDir:'tests/browser',timeout:30000,workers:2,globalSetup:'./scripts/browser-test-setup.ts',globalTeardown:'./scripts/browser-test-teardown.ts',use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',headless:true,storageState:join(process.env.HORIZON_BROWSER_TEST_DIRECTORY,'browser-state.json')},webServer:{command:'npx tsx scripts/browser-test-server.ts',url:'http://127.0.0.1:5173',reuseExistingServer:false,timeout:120000}});
