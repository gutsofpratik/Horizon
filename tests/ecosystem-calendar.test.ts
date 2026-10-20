import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextOccurrence,cronFields} from '../server/automation/calendar.ts';
test('calendar keeps elapsed intervals independent of timezone',async()=>{assert.equal(await nextOccurrence({kind:'interval',seconds:3600},Date.parse('2026-10-19T00:00:00Z')),'2026-10-19T01:00:00.000Z');});
test('calendar applies timezone cron and skips nonexistent DST wall times',async()=>{assert.equal(await nextOccurrence({kind:'cron',expression:'30 2 * * *',timeZone:'America/New_York'},Date.parse('2026-03-08T06:59:00Z')),'2026-03-09T06:30:00.000Z');});
test('calendar does not duplicate one-time occurrences',async()=>{assert.equal(await nextOccurrence({kind:'once',at:'2026-10-19T00:00:00Z'},Date.parse('2026-10-19T00:00:00Z')),null);});
test('invalid cron cannot turn into an always-running job',()=>{assert.throws(()=>cronFields('* * * *'));assert.throws(()=>cronFields('*/0 * * * *'));assert.throws(()=>cronFields('99 * * * *'));});
