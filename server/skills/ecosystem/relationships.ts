import type {SkillPackage,SkillRelation} from './types.ts';
export const sp=(name:string)=>'github:obra/superpowers:skills/'+name;
export const ecc=(name:string)=>'github:affaan-m/ecc:skills/'+name;
export const legacySkillAliases:Record<string,string>={
 'openclaude-tool-operation':'horizon:adapter:interaction','openclaude-terminal-workflow':'horizon:adapter:interaction','openclaude-browser-and-computer':'horizon:adapter:interaction',
 'openclaude-spreadsheet-workflow':'horizon:adapter:documents','openclaude-document-workflow':'horizon:adapter:documents','openclaude-presentation-workflow':'horizon:adapter:documents',
 'openclaude-data-and-creative-workflows':'horizon:adapter:artifacts','horizon-frontend-design':'github:anthropics/skills:skills/frontend-design',
 'horizon-coding-workflow':ecc('codebase-onboarding'),'horizon-planning-workflow':sp('writing-plans'),'horizon-systematic-debugging':sp('systematic-debugging'),
 'horizon-verification-workflow':sp('verification-before-completion'),'horizon-research-workflow':ecc('research-ops'),
 'openclaude-skill-author':sp('writing-skills'),'openclaude-tool-author':'horizon:adapter:interaction','openclaude-runtime-orchestration':'horizon:adapter:interaction'
};
export const canonicalAlias=(id:string)=>legacySkillAliases[id]??(/^claude-plugins\/superpowers\/[^/]+\/skills\/([a-z0-9-]+)$/.test(id)?sp(id.split('/').at(-1)!):id);
export function workflowRelations(packages:SkillPackage[]):SkillRelation[]{
 const pairs:SkillRelation[]=[
  {from:sp('brainstorming'),to:sp('writing-plans'),stage:'planning'},
  {from:sp('writing-plans'),to:sp('executing-plans'),stage:'implementation'},
  ...[ecc('codebase-onboarding'),'github:anthropics/skills:skills/frontend-design','horizon:adapter:documents','horizon:adapter:artifacts',ecc('research-ops')].map(to=>({from:sp('executing-plans'),to,stage:'implementation' as const})),
  {from:sp('systematic-debugging'),to:sp('test-driven-development'),stage:'implementation'},
  {from:sp('test-driven-development'),to:sp('verification-before-completion'),stage:'verification'},
  {from:ecc('codebase-onboarding'),to:sp('verification-before-completion'),stage:'verification'},
  {from:sp('verification-before-completion'),to:sp('requesting-code-review'),stage:'related'}
 ];const ids=new Set(packages.map(p=>p.id));return pairs.filter(e=>ids.has(e.from)&&ids.has(e.to));
}
export function validateRelations(edges:SkillRelation[]){const visited=new Set<string>(),active=new Set<string>();function visit(id:string){if(active.has(id))throw Error('Skill workflow relationship cycle: '+id);if(visited.has(id))return;active.add(id);for(const edge of edges.filter(e=>e.from===id&&e.stage!=='related'))visit(edge.to);active.delete(id);visited.add(id);}for(const edge of edges)visit(edge.from);}
