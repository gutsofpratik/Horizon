import { AssistantEditor } from './AssistantEditor';
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../app/api';

type Binding = 'auto' | 'include' | 'exclude';
const empty: any[] = [];

export interface ConversationSkillsProps {
  conversationId?: string;
  conversation?: any;
  skills?: any[];
  assistants?: any[];
  onChange?: (conversation: any) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

/** Works for an existing chat or an unsaved composer draft. */
export function ConversationSkills({
  conversationId,
  conversation = {},
  skills = empty,
  assistants = empty,
  onChange,
  onError,
  disabled = false,
}: ConversationSkillsProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const id = conversationId ?? conversation.id;

  useEffect(() => {
    let active = true;
    let pending = false;
    setData(null);
    if (!open) return;
    setError('');
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = id
          ? await api('/conversations/' + encodeURIComponent(id) + '/skills')
          : await Promise.all([
              skills.length ? Promise.resolve(skills) : api('/skills'),
              assistants.length ? Promise.resolve(assistants) : api('/assistants'),
            ]).then(([statuses, choices]) => ({ statuses, assistants: choices }));
        if (active) {
          setData(value);
          setError('');
        }
      } catch (fault) {
        if (active) setError((fault as Error).message);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = id ? setInterval(refresh, 2500) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [id, open, skills, assistants, revision]);

  const update = async (patch: any) => {
    setBusy(true);
    setError('');
    try {
      const next = {
        ...conversation,
        ...patch,
        skillBindings: { ...conversation.skillBindings, ...patch.skillBindings },
      };
      if (id) {
        const result = await api('/conversations/' + encodeURIComponent(id) + '/skills', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        setData(result);
        next.skillBindings = result.bindings;
        next.assistantId = result.assistant.id;
        next.workflowPresetId = result.workflowPresetId;
        if (patch.assistantId) {
          if (result.assistant.providerId) next.providerId = result.assistant.providerId;
          if (result.assistant.model) next.model = result.assistant.model;
        }
      } else {
        setData((previous: any) => ({ ...previous, bindings: next.skillBindings }));
      }
      if (patch.assistantId && !id) {
        const chosen = (data?.assistants ?? assistants).find((item: any) => item.id === patch.assistantId);
        if (chosen?.providerId) next.providerId = chosen.providerId;
        if (chosen?.model) next.model = chosen.model;
      }
      onChange?.(next);
    } catch (fault) {
      const message = (fault as Error).message;
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const bindings = data?.bindings ?? conversation.skillBindings ?? {};
  const availableAssistants = data?.assistants ?? assistants;
  return (
    <details
      className="conversation-skills"
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      style={{ position: 'relative' }}
    >
      <summary
        aria-label="Conversation skills and assistant"
        style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
      >
        <SlidersHorizontal size={14} /> Skills
      </summary>
      {open && (
        <section
          aria-label="Conversation skills"
          style={{
            position: 'absolute', bottom: 'calc(100% + 10px)', left: 0, zIndex: 50,
            width: 350, maxWidth: '85vw', padding: 16,
            border: '1px solid var(--border, #dedbd5)', borderRadius: 12,
            background: 'var(--main, #faf9f5)', maxHeight: '75vh', overflowY: 'auto',
            boxShadow: '0 12px 40px #0002',
          }}
        >
          <strong>Skills for this chat</strong>
          <p style={{ fontSize: 12, margin: '6px 0 14px' }}>
            Choose defaults and overrides. Manage installations in the Skills library.
          </p>
          <label style={{ display: 'block', fontSize: 12 }}>
            Assistant
            <select
              aria-label="Conversation assistant"
              disabled={disabled || busy || !data}
              value={data?.assistant?.id ?? conversation.assistantId ?? 'general'}
              onChange={event => update({ assistantId: event.target.value })}
              style={{ width: '100%', margin: '5px 0 10px' }}
            >
              {availableAssistants.map((assistant: any) => (
                <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', fontSize: 12 }}>
            Workflow defaults
            <select
              aria-label="Conversation workflow defaults"
              disabled={disabled || busy || !data}
              value={data?.workflowPresetId ?? conversation.workflowPresetId ?? ''}
              onChange={event => update({ workflowPresetId: event.target.value || null })}
              style={{ width: '100%', margin: '5px 0 10px' }}
            >
              <option value="">Assistant defaults</option>
              {availableAssistants.filter((assistant: any) => assistant.builtIn).map((assistant: any) => (
                <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
              ))}
            </select>
          </label>
          <AssistantEditor
            assistants={availableAssistants}
            skills={data?.statuses ?? skills}
            onSaved={() => setRevision(value => value + 1)}
            onError={message => { setError(message); onError?.(message); }}
          />
          {!!data?.runtimeRequirements?.length && (
            <div style={{ fontSize: 11, marginBottom: 10 }}>
              {data.runtimeRequirements.map((requirement: any) => (
                <p key={requirement.id}>
                  {requirement.name}: {requirement.status}
                  {requirement.detail ? ' · ' + requirement.detail : ''}
                </p>
              ))}
            </div>
          )}
          {data?.activeRunId && (
            <p role="status" style={{ fontSize: 12 }}>
              {data.loadedSkillIds?.length ?? 0} skills loaded for the current response.
            </p>
          )}
          <input
            aria-label="Filter conversation skills"
            placeholder="Find a skill…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
          />
          {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger, #a22)' }}>{error}</p>}
          {!data && !error && <p role="status">Loading skills…</p>}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {(data?.statuses ?? []).filter((skill: any) => (skill.name + ' ' + skill.description).toLowerCase().includes(query.toLowerCase())).map((skill: any) => {
              const mode: Binding = bindings[skill.id] ?? skill.binding ?? (conversation.skillIds?.includes(skill.id) ? 'include' : 'auto');
              const unavailable = !skill.installed || skill.enabled === false || skill.available === false || skill.runtimeReady === false;
              return (
                <div key={skill.qualifiedId ?? skill.id} style={{ padding: '9px 0', borderTop: '1px solid var(--border, #dedbd5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{skill.name}</span>
                    <select
                      aria-label={'Use ' + skill.name + ' in this chat'}
                      value={mode}
                      disabled={disabled || busy}
                      onChange={event => update({ skillBindings: { [skill.id]: event.target.value } })}
                    >
                      <option value="auto">Auto</option>
                      <option value="include" disabled={unavailable}>Include</option>
                      <option value="exclude">Exclude</option>
                    </select>
                  </div>
                  <small style={{ display: 'block', fontSize: 11, opacity: .65, marginTop: 3 }}>
                    {skill.provenance?.kind ?? skill.sourceFamily ?? 'Skill'}
                    {skill.version ? ' · ' + skill.version.slice(0, 8) : ''}
                    {skill.preferred ? ' · assistant default' : ''}
                    {skill.loaded ? ' · loaded for this response' : ''}
                    {unavailable ? ' · ' + (skill.reason ?? skill.unavailableReason ?? 'Unavailable') : ''}
                  </small>
                  {!!skill.requirementStatus?.length && (
                    <details style={{ fontSize: 11, marginTop: 5 }}>
                      <summary>Runtime requirements</summary>
                      {skill.requirementStatus.map((requirement: any) => (
                        <div key={requirement.id}>
                          {requirement.id}: {requirement.status}{requirement.reason ? ' — ' + requirement.reason : ''}
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, opacity: .65, margin: '12px 0 0' }}>
            Auto loads skills when relevant. Include prioritizes a skill; Exclude prevents loading. These choices grant no tools or permissions.
          </p>
        </section>
      )}
    </details>
  );
}
