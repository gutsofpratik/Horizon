import {registerGateway} from './gateway.ts';
import {registerCustomTools} from './custom.ts';
import {registerTimeTools} from './schedules.ts';
import {registerCapabilityTool} from './capabilities.ts';
import {registerAutomationTools} from './automation.ts';
import {registerResearchTools} from '../research/tools.ts';
import {registerBrowserFileTools} from '../browser/files.ts';
import type {AppContext} from '../app.ts';
import {ToolRegistry} from './registry.ts';import {registerFileTools} from './files.ts';import {registerCoreTools} from './core.ts';import {registerArtifactTools} from '../artifacts/tools.ts';
import {registerSkillTools} from '../skills/tools.ts';import {registerWebTools} from './web.ts';
import {registerDraftTools} from '../artifacts/drafts.ts';
import {registerHistoryTools} from './history.ts';
import {registerQuestionTool} from './questions.ts';
import {registerDiscoveryTool} from './discovery.ts';
import {registerRuntimeTools} from '../runtime/tools.ts';
export function createTools(app:AppContext){const registry=new ToolRegistry(app);registerFileTools(registry);registerCoreTools(registry);registerHistoryTools(registry);registerResearchTools(registry);registerQuestionTool(registry);registerArtifactTools(registry);registerDraftTools(registry);registerSkillTools(registry);registerWebTools(registry);registerRuntimeTools(registry,app);registerDiscoveryTool(registry);registerBrowserFileTools(registry);registerCapabilityTool(registry);registerAutomationTools(registry);registerTimeTools(registry);registerGateway(registry);registerCustomTools(registry,app);return registry;}

