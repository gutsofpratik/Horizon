import {test as base,expect} from '@playwright/test';

// UI suites exercise controls and rendering. Real Office/PDF startup is covered
// by runtime integration tests; do not download workers for every UI run.
export const test=base.extend({page:async({page},use)=>{
 await page.route('**/api/runtime/readiness',route=>route.fulfill({json:{ready:true,office:{ready:true,status:'ready'},pdf:{ready:true,status:'ready'}}}));
 await use(page);
}});
export {expect};
