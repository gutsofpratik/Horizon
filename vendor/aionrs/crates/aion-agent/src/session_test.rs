use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use aion_types::message::{ContentBlock, Message, Role};
    use chrono::Duration;
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use tempfile::tempdir;
    use uuid::Uuid;

    #[test]
    fn test_create_session() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let result = manager.create("openai", "gpt-4", "/tmp", None);
        assert!(result.is_ok());

        let session = result.unwrap();
        assert_eq!(session.provider, "openai");
        assert_eq!(session.model, "gpt-4");
        assert_eq!(session.cwd, "/tmp");
        assert!(session.messages.is_empty());
        assert!(manager.state_path(&session.id).is_file());
        assert!(!dir.path().join("index.json").exists());

        let state_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(manager.state_path(&session.id)).unwrap()).unwrap();
        assert_eq!(state_json["context_state"]["schema_version"], 1);
        assert_eq!(state_json["context_state"]["context_usage"], 0);
        assert!(state_json["context_state"].get("observed_context_window").is_none());
    }

    #[test]
    fn test_save_and_load_session() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let session = manager.create("anthropic", "claude-3", "/home", None).unwrap();
        let loaded = manager.load(&session.id).unwrap();

        assert_eq!(loaded.id, session.id);
        assert_eq!(loaded.provider, "anthropic");
        assert_eq!(loaded.model, "claude-3");
        assert_eq!(loaded.cwd, "/home");
    }

    #[test]
    fn test_load_session_without_context_state_uses_backward_compatible_default() {
        let mut value = serde_json::to_value(sample_session("old-session", "old-model")).unwrap();
        value.as_object_mut().unwrap().remove("context_state");

        let loaded: Session = serde_json::from_value(value).unwrap();

        assert_eq!(loaded.context_state.context_usage, 0);
        assert_eq!(loaded.context_state.compact_count, 0);
        assert_eq!(loaded.context_state.microcompact_count, 0);
    }

    #[test]
    fn test_load_nonexistent_returns_error() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let result = manager.load("nonexistent-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_sessions_empty() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let sessions = manager.list().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_list_sessions_sorted_by_time() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let s1 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();
        let s2 = manager.create("anthropic", "claude-3", "/home", None).unwrap();

        let list = manager.list().unwrap();
        assert_eq!(list.len(), 2);

        let ids: Vec<&str> = list.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&s1.id.as_str()));
        assert!(ids.contains(&s2.id.as_str()));
    }

    #[test]
    fn test_update_index() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        let mut session = manager.create("openai", "gpt-4", "/tmp", None).unwrap();

        let msg = Message::new(
            Role::User,
            vec![ContentBlock::Text {
                text: "hello".to_string(),
            }],
        );
        session.messages.push(msg);

        manager.update_index_for(&session).unwrap();

        let list = manager.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].summary, "hello");
        assert_eq!(list[0].message_count, 1);
    }

    #[test]
    fn test_load_legacy_session_migrates_to_current_layout() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let legacy = sample_session("legacy-session", "legacy model");
        write_legacy_session(dir.path(), &legacy);
        write_legacy_index(dir.path(), &[meta_from_session(&legacy)]);

        let loaded = manager.load(&legacy.id).unwrap();

        assert_eq!(loaded.id, legacy.id);
        assert_eq!(loaded.model, legacy.model);
        assert!(manager.state_path(&legacy.id).is_file());
        assert!(dir.path().join("2026-07-07_legacy-session.json").is_file());
        assert!(dir.path().join("index.json").is_file());
    }

    #[test]
    fn test_load_prefers_current_layout_over_legacy_layout() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let legacy = sample_session("same-session", "legacy model");
        let current = sample_session("same-session", "current model");
        write_legacy_session(dir.path(), &legacy);
        manager.save(&current).unwrap();

        let loaded = manager.load("same-session").unwrap();

        assert_eq!(loaded.model, "current model");
    }

    #[test]
    fn test_list_merges_legacy_and_current_sessions() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let legacy = sample_session("legacy-session", "legacy model");
        let current = sample_session("current-session", "current model");
        let overridden_legacy = sample_session("same-session", "legacy model");
        let overriding_current = sample_session("same-session", "current model");
        write_legacy_session(dir.path(), &legacy);
        write_legacy_session(dir.path(), &overridden_legacy);
        manager.save(&current).unwrap();
        manager.save(&overriding_current).unwrap();

        let list = manager.list().unwrap();

        assert_eq!(list.len(), 3);
        assert!(list.iter().any(|meta| meta.id == "legacy-session"));
        assert!(list.iter().any(|meta| meta.id == "current-session"));
        let same = list.iter().find(|meta| meta.id == "same-session").unwrap();
        assert_eq!(same.model, "current model");
    }

    #[test]
    fn test_list_current_skips_invalid_state_json() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let valid = sample_session("valid-session", "current model");
        manager.save(&valid).unwrap();

        let invalid_dir = dir.path().join("sessions").join("invalid-session");
        fs::create_dir_all(&invalid_dir).unwrap();
        fs::write(invalid_dir.join("state.json"), "{ invalid json").unwrap();

        let list = manager.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "valid-session");

        let latest = manager.load("latest").unwrap();
        assert_eq!(latest.id, "valid-session");
    }

    #[test]
    fn test_create_skips_invalid_legacy_json_when_checking_existing_id() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        fs::write(dir.path().join("broken.json"), "{ invalid json").unwrap();

        let session = manager.create("openai", "gpt-4", "/tmp", Some("new-session")).unwrap();

        assert_eq!(session.id, "new-session");
        assert!(manager.state_path("new-session").is_file());
    }

    #[test]
    fn test_list_skips_invalid_legacy_index() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let legacy = sample_session("legacy-session", "legacy model");
        write_legacy_session(dir.path(), &legacy);
        fs::write(dir.path().join("index.json"), "{ invalid json").unwrap();

        let list = manager.list().unwrap();

        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "legacy-session");
    }

    #[test]
    fn test_list_legacy_skips_indexed_session_with_invalid_file() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let valid = sample_session("valid-session", "legacy model");
        let mut invalid_meta = meta_from_session(&sample_session("invalid-session", "legacy model"));
        invalid_meta.created_at = valid.created_at + Duration::seconds(1);
        invalid_meta.updated_at = valid.updated_at + Duration::seconds(1);

        write_legacy_session(dir.path(), &valid);
        fs::write(dir.path().join("2026-07-07_invalid-session.json"), "{ invalid json").unwrap();
        write_legacy_index(dir.path(), &[meta_from_session(&valid), invalid_meta]);

        let list = manager.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "valid-session");

        let latest = manager.load("latest").unwrap();
        assert_eq!(latest.id, "valid-session");
    }

    #[test]
    fn test_cleanup_old_sessions() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 2);

        let _s1 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();
        let _s2 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();
        let _s3 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();

        let list = manager.list().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_cleanup_does_not_remove_legacy_sessions() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 1);
        let legacy = sample_session("legacy-session", "legacy model");
        write_legacy_session(dir.path(), &legacy);

        let _s1 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();
        let _s2 = manager.create("openai", "gpt-4", "/tmp", None).unwrap();

        assert!(dir.path().join("2026-07-07_legacy-session.json").is_file());
        let list = manager.list().unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().any(|meta| meta.id == "legacy-session"));
    }

    #[test]
    fn test_session_id_is_uuid_v7() {
        let id1 = generate_session_id();
        let id2 = generate_session_id();
        assert_ne!(id1, id2);

        let parsed = Uuid::parse_str(&id1).unwrap();
        assert_eq!(id1.len(), 36);
        assert_eq!(parsed.get_version_num(), 7);
    }

    #[test]
    fn test_session_lock_registry_prunes_unused_locks() {
        let dir = tempdir().unwrap();
        let old_path = dir.path().join("sessions").join("old-session");

        {
            let lock = session_lock(old_path.clone());
            let _guard = lock.lock().unwrap();
            assert!(session_lock_registry_contains(&old_path));
        }

        {
            let new_path = dir.path().join("sessions").join("new-session");
            let _lock = session_lock(new_path);
        }

        assert!(!session_lock_registry_contains(&old_path));
    }

    #[test]
    fn test_concurrent_create_same_custom_id_allows_one_writer() {
        let dir = tempdir().unwrap();
        let manager = Arc::new(SessionManager::new(dir.path().to_path_buf(), 10));
        let barrier = Arc::new(Barrier::new(2));

        let handles: Vec<_> = (0..2)
            .map(|_| {
                let manager = Arc::clone(&manager);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    manager.create("openai", "gpt-4", "/tmp", Some("same-session"))
                })
            })
            .collect();

        let results: Vec<_> = handles.into_iter().map(|handle| handle.join().unwrap()).collect();
        let success_count = results.iter().filter(|result| result.is_ok()).count();
        let error_count = results.iter().filter(|result| result.is_err()).count();

        assert_eq!(success_count, 1);
        assert_eq!(error_count, 1);
        assert!(manager.state_path("same-session").is_file());
    }

    #[test]
    fn test_fork_copies_history_into_new_session_with_lineage() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let mut source = sample_session("source-a", "model-x");
        source.messages.push(Message::new(
            Role::Assistant,
            vec![ContentBlock::Text {
                text: "reply".to_string(),
            }],
        ));
        manager.save(&source).unwrap();

        let fork = manager.fork("source-a", None).unwrap();

        assert_ne!(fork.id, source.id);
        assert_eq!(fork.forked_from.as_deref(), Some("source-a"));
        assert_eq!(fork.root_id.as_deref(), Some("source-a"));
        assert_eq!(fork.messages.len(), source.messages.len());
        assert_eq!(fork.provider, source.provider);
        assert_eq!(fork.model, source.model);
        assert!(fork.created_at > source.created_at);
        // The fork is persisted and independently loadable.
        let loaded = manager.load(&fork.id).unwrap();
        assert_eq!(loaded.messages.len(), source.messages.len());
        assert_eq!(loaded.forked_from.as_deref(), Some("source-a"));
    }

    #[test]
    fn test_fork_does_not_mutate_source_session() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let source = sample_session("source-b", "model-x");
        manager.save(&source).unwrap();
        let source_bytes_before = fs::read_to_string(manager.state_path("source-b")).unwrap();

        let fork = manager.fork("source-b", None).unwrap();

        let source_bytes_after = fs::read_to_string(manager.state_path("source-b")).unwrap();
        assert_eq!(source_bytes_before, source_bytes_after);
        // Diverging the fork afterwards still leaves the source untouched.
        let mut fork = fork;
        fork.messages.push(Message::new(
            Role::User,
            vec![ContentBlock::Text {
                text: "new branch message".to_string(),
            }],
        ));
        manager.save(&fork).unwrap();
        let reloaded_source = manager.load("source-b").unwrap();
        assert_eq!(reloaded_source.messages.len(), source.messages.len());
        assert!(reloaded_source.forked_from.is_none());
    }

    #[test]
    fn test_fork_with_custom_id_and_collision_bails() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        manager.save(&sample_session("source-c", "model-x")).unwrap();

        let fork = manager.fork("source-c", Some("custom-fork-id")).unwrap();
        assert_eq!(fork.id, "custom-fork-id");
        assert!(manager.state_path("custom-fork-id").is_file());

        // Forking into an id that already exists (including the source
        // itself) must fail without touching the existing session.
        let err = manager.fork("source-c", Some("custom-fork-id")).unwrap_err();
        assert!(err.to_string().contains("already exists"), "unexpected error: {err}");
        let err = manager.fork("source-c", Some("source-c")).unwrap_err();
        assert!(err.to_string().contains("already exists"), "unexpected error: {err}");
    }

    #[test]
    fn test_fork_of_fork_keeps_original_root() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        manager.save(&sample_session("root-session", "model-x")).unwrap();

        let first = manager.fork("root-session", None).unwrap();
        let second = manager.fork(&first.id, None).unwrap();

        assert_eq!(second.forked_from.as_deref(), Some(first.id.as_str()));
        assert_eq!(second.root_id.as_deref(), Some("root-session"));
        assert_eq!(first.root_id.as_deref(), Some("root-session"));
    }

    #[test]
    fn test_fork_at_turn_truncates_through_anchor_inclusive() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let mut source = sample_session("turn-source", "model-x");
        source.messages.clear();
        for (turn, text) in [
            (Some("turn-1"), "u1"),
            (Some("turn-1"), "a1"),
            (Some("turn-2"), "u2"),
            (Some("turn-2"), "a2"),
            (Some("turn-3"), "u3"),
        ] {
            let mut m = Message::now(Role::User, vec![ContentBlock::Text { text: text.into() }]);
            m.turn_id = turn.map(str::to_owned);
            source.messages.push(m);
        }
        manager.save(&source).unwrap();

        let fork = manager
            .fork_from(&source, None, ForkBoundary::AtTurn("turn-2"))
            .unwrap();

        assert_eq!(fork.messages.len(), 4, "cut after the LAST turn-2 message, inclusive");
        assert_eq!(fork.messages.last().unwrap().turn_id.as_deref(), Some("turn-2"));
        // Source untouched.
        assert_eq!(manager.load("turn-source").unwrap().messages.len(), 5);
    }

    #[test]
    fn test_fork_at_unknown_anchor_is_refused_not_degraded() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        // sample_session's message carries no turn_id — the shape of
        // pre-turn-tracking history or a compacted-away turn.
        let source = sample_session("turn-source-2", "model-x");
        manager.save(&source).unwrap();

        let err = manager
            .fork_from(&source, Some("should-not-exist"), ForkBoundary::AtTurn("turn-9"))
            .unwrap_err();
        assert!(err.to_string().contains("not found"), "unexpected error: {err}");
        // Refusal must not leave a partial fork behind.
        assert!(manager.load("should-not-exist").is_err());
    }

    #[test]
    fn test_fork_nonexistent_source_errors() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);

        assert!(manager.fork("no-such-session", None).is_err());
    }

    #[test]
    fn test_session_without_lineage_fields_deserializes_as_root() {
        let mut value = serde_json::to_value(sample_session("pre-fork-format", "old-model")).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.remove("forked_from");
        obj.remove("root_id");

        let loaded: Session = serde_json::from_value(value).unwrap();

        assert!(loaded.forked_from.is_none());
        assert!(loaded.root_id.is_none());
    }

    #[test]
    fn test_non_fork_session_serializes_without_lineage_keys() {
        let dir = tempdir().unwrap();
        let manager = SessionManager::new(dir.path().to_path_buf(), 10);
        let session = manager.create("openai", "gpt-4", "/tmp", None).unwrap();

        let state_json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(manager.state_path(&session.id)).unwrap()).unwrap();
        assert!(state_json.get("forked_from").is_none());
        assert!(state_json.get("root_id").is_none());
    }

    fn sample_session(id: &str, model: &str) -> Session {
        Session {
            id: id.to_string(),
            forked_from: None,
            root_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            provider: "test-provider".to_string(),
            model: model.to_string(),
            cwd: "/tmp".to_string(),
            total_usage: TokenUsage::default(),
            context_state: ContextState::default(),
            messages: vec![Message::new(
                Role::User,
                vec![ContentBlock::Text {
                    text: format!("summary for {id}"),
                }],
            )],
        }
    }

    fn write_legacy_session(directory: &Path, session: &Session) {
        let path = directory.join(format!("2026-07-07_{}.json", session.id));
        fs::write(path, serde_json::to_string_pretty(session).unwrap()).unwrap();
    }

    fn write_legacy_index(directory: &Path, sessions: &[SessionMeta]) {
        let index = SessionIndex {
            sessions: sessions.to_vec(),
        };
        fs::write(
            directory.join("index.json"),
            serde_json::to_string_pretty(&index).unwrap(),
        )
        .unwrap();
    }
}
