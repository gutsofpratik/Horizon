import {registerShellTools} from './shell.ts';
import {registerApiTools} from './api.ts';
import {registerTriggerTools} from './triggers.ts';
import {registerNotificationTools} from './notifications.ts';
import {registerMcpTools} from './mcp.ts';
import {registerHttpTools} from './http.ts';
import {registerDataTools} from './data.ts';
import {registerToolGroups} from './groups.ts';
import {registerExtendedFileTools} from './files-extended.ts';
import {registerGitTools} from './git.ts';
import {registerSubagentTools} from './subagents.ts';
import {registerGoalTools} from '../goals/tools.ts';
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
export function createTools(app:AppContext){const registry=new ToolRegistry(app);registerFileTools(registry);registerExtendedFileTools(registry);registerDataTools(registry);registerApiTools(registry);registerTriggerTools(registry);registerNotificationTools(registry);registerGitTools(registry);registerSubagentTools(registry);registerCoreTools(registry);registerHttpTools(registry);registerMcpTools(registry);registerHistoryTools(registry);registerResearchTools(registry);registerQuestionTool(registry);registerArtifactTools(registry);registerDraftTools(registry);registerSkillTools(registry);registerWebTools(registry);registerRuntimeTools(registry,app);registerShellTools(registry);registerDiscoveryTool(registry);registerBrowserFileTools(registry);registerCapabilityTool(registry);registerAutomationTools(registry);registerTimeTools(registry);registerGateway(registry);registerCustomTools(registry,app);registerGoalTools(registry);registerToolGroups(registry);return registry;}

