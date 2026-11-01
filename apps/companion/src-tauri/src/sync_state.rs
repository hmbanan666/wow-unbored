//! Local sync results belong to the settings/Device generation that started them.
//! Capture under `lock`, do network work unlocked, then use `apply` for effects.

use std::ops::{Deref, DerefMut};
use std::sync::{Arc, LockResult, Mutex, MutexGuard};

#[derive(Clone)]
pub(crate) struct Generation(Arc<Mutex<()>>);

impl Generation {
    /// Serialize a complete Prefetch pass, from reading inputs through applying
    /// its files, acknowledgements and status. Never acquire while holding the
    /// model lock. A replacement generation has its own independent queue.
    pub(crate) fn prefetch(&self) -> Result<MutexGuard<'_, ()>, String> {
        self.0.lock().map_err(|err| err.to_string())
    }
}

pub(crate) struct Current<T> {
    generation: Generation,
    value: T,
}

impl<T> Current<T> {
    pub(crate) fn generation(&self) -> Generation {
        self.generation.clone()
    }

    /// Invalidate first, under the same lock as erasure or settings replacement.
    /// Even a failed disk operation must not make old results current again.
    pub(crate) fn invalidate(&mut self) {
        self.generation = Generation(Arc::new(Mutex::new(())));
    }
}

impl<T> Deref for Current<T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.value
    }
}

impl<T> DerefMut for Current<T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut self.value
    }
}

pub(crate) struct SyncState<T>(Mutex<Current<T>>);

impl<T> SyncState<T> {
    pub(crate) fn new(value: T) -> Self {
        Self(Mutex::new(Current {
            generation: Generation(Arc::new(Mutex::new(()))),
            value,
        }))
    }

    pub(crate) fn lock(&self) -> LockResult<MutexGuard<'_, Current<T>>> {
        self.0.lock()
    }

    /// The generation check and all local effects are one critical section.
    /// Never put network I/O inside `effect`.
    pub(crate) fn apply<R>(
        &self,
        generation: &Generation,
        effect: impl FnOnce(&mut Current<T>) -> R,
    ) -> Result<Option<R>, String> {
        let mut current = self.lock().map_err(|err| err.to_string())?;
        if !Arc::ptr_eq(&current.generation.0, &generation.0) {
            return Ok(None);
        }
        Ok(Some(effect(&mut current)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan::{
        clear_helper, install_advice, install_plan, install_suggestions, write_status,
        CompanionStatus, Plan,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{mpsc, Barrier};
    use std::thread;

    struct Retail(PathBuf);

    impl Retail {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("unbored-generation-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            let retail = Self(path);
            prefetch(&retail.0, "plan");
            prefetch(&retail.0, "advice");
            prefetch(&retail.0, "suggestions");
            prefetch(&retail.0, "pairing");
            retail
        }

        fn files(&self) -> Vec<Vec<u8>> {
            ["Plan.lua", "Advice.lua", "Suggestions.lua"]
                .iter()
                .map(|name| {
                    fs::read(self.0.join("Interface/AddOns/Unbored_Plan").join(name)).unwrap()
                })
                .collect()
        }
    }

    impl Drop for Retail {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn prefetch(retail: &Path, kind: &str) {
        match kind {
            "plan" => {
                let plan: Plan = serde_json::from_str(include_str!(
                    "../../../../packages/contracts/fixtures/plan.json"
                ))
                .unwrap();
                install_plan(retail, &plan).unwrap();
            }
            "advice" => {
                let characters =
                    serde_json::json!([{ "character": "Hero", "realm": "Realm", "items": [] }]);
                install_advice(retail, &characters, &serde_json::Value::Null).unwrap();
            }
            "suggestions" => {
                let body = serde_json::from_str(include_str!(
                    "../../../../packages/contracts/fixtures/suggestions.json"
                ))
                .unwrap();
                install_suggestions(retail, &body).unwrap();
            }
            "pairing" => {
                write_status(
                    retail,
                    &CompanionStatus {
                        pairing: "approved".into(),
                        ..Default::default()
                    },
                )
                .unwrap();
            }
            _ => {}
        }
    }

    #[derive(Default)]
    struct Local {
        approved: bool,
        forgotten: bool,
        ready: bool,
        acknowledged: Vec<String>,
        notices: Vec<String>,
    }

    fn apply_prefetch(
        state: &SyncState<Local>,
        generation: &Generation,
        retail: &Path,
        label: &str,
    ) {
        state
            .apply(generation, |local| {
                let mut plan: Plan = serde_json::from_str(include_str!(
                    "../../../../packages/contracts/fixtures/plan.json"
                ))
                .unwrap();
                plan.title = Some(label.into());
                install_plan(retail, &plan).unwrap();
                install_advice(
                    retail,
                    &serde_json::json!([
                        { "character": label, "realm": "Realm", "items": [] }
                    ]),
                    &serde_json::Value::Null,
                )
                .unwrap();
                install_suggestions(retail, &serde_json::json!({
                "characters": { "Hero-Realm": [{ "id": label, "title": label, "goal": label }] }
            })).unwrap();
                write_status(
                    retail,
                    &CompanionStatus {
                        companion_version: label.into(),
                        ..Default::default()
                    },
                )
                .unwrap();
                local.acknowledged.push(label.into());
                local.notices.push(label.into());
            })
            .unwrap();
    }

    #[test]
    fn overlapping_prefetch_reads_and_applies_in_order() {
        let retail = Retail::new("ordered");
        let state = SyncState::new(Local::default());
        let generation = state.lock().unwrap().generation();
        let (started, waiting) = mpsc::channel();
        let (release, released) = mpsc::channel();
        let (attempt, attempting) = mpsc::channel();
        let (entered, entering) = mpsc::channel();
        thread::scope(|scope| {
            let (state, generation, retail) = (&state, &generation, &retail);
            let first = scope.spawn(move || {
                let _pass = generation.prefetch().unwrap();
                started.send(()).unwrap();
                released.recv().unwrap(); // Delayed Server response, outside the model lock.
                apply_prefetch(state, generation, &retail.0, "older");
            });
            waiting.recv().unwrap();
            let second = scope.spawn(move || {
                attempt.send(()).unwrap();
                let _pass = generation.prefetch().unwrap();
                let acknowledged = state.lock().unwrap().acknowledged.clone();
                entered.send(acknowledged).unwrap(); // Start reading only after entering the pass.
                apply_prefetch(state, generation, &retail.0, "newer");
            });
            attempting.recv().unwrap();
            let early = entering.recv_timeout(std::time::Duration::from_millis(100));
            // Release before asserting, so a failing test cannot strand scoped threads.
            release.send(()).unwrap();
            first.join().unwrap();
            second.join().unwrap();
            assert!(
                matches!(early, Err(mpsc::RecvTimeoutError::Timeout)),
                "a second fetch started before the first applied: {early:?}"
            );
            assert_eq!(entering.recv().unwrap(), vec!["older"]);
        });
        for file in retail.files() {
            let text = String::from_utf8(file).unwrap();
            assert!(text.contains("newer"), "{text}");
            assert!(!text.contains("older"), "{text}");
        }
        let local = state.lock().unwrap();
        assert_eq!(local.acknowledged, vec!["older", "newer"]);
        assert_eq!(local.notices, vec!["older", "newer"]);
    }

    #[test]
    fn queued_prefetch_rechecks_generation_without_blocking_the_replacement() {
        let state = SyncState::new(Local::default());
        let old = state.lock().unwrap().generation();
        let pass = old.prefetch().unwrap();
        let (attempt, attempting) = mpsc::channel();
        let (entered, entering) = mpsc::channel();
        thread::scope(|scope| {
            let queued = scope.spawn(|| {
                attempt.send(()).unwrap();
                let _pass = old.prefetch().unwrap();
                state
                    .apply(&old, |local| local.notices.push("stale".into()))
                    .unwrap()
            });
            attempting.recv().unwrap();
            let current = {
                // Forget/settings need only the model, not the Prefetch lock.
                let mut local = state.lock().unwrap();
                local.invalidate();
                local.generation()
            };
            let replacement = scope.spawn(move || {
                let _pass = current.prefetch().unwrap();
                entered.send(()).unwrap();
            });
            let fresh_entered = entering.recv_timeout(std::time::Duration::from_secs(1));
            drop(pass);
            let stale = queued.join().unwrap();
            replacement.join().unwrap();
            assert!(
                fresh_entered.is_ok(),
                "new generation waited for old network work"
            );
            assert_eq!(stale, None);
        });
        assert!(state.lock().unwrap().notices.is_empty());
    }

    #[test]
    fn failed_prefetch_releases_the_next_pass() {
        let generation = Generation(Arc::new(Mutex::new(())));
        let fail = || -> Result<(), &str> {
            let _pass = generation.prefetch().unwrap();
            Err("transport failure")
        };
        assert!(fail().is_err());
        let _next = generation.prefetch().unwrap();
    }

    #[test]
    fn delayed_results_cannot_restore_erased_files_or_local_state() {
        let retail = Retail::new("delayed");
        let personal = retail.files();
        let state = SyncState::new(Local {
            approved: true,
            ..Default::default()
        });
        let started = Barrier::new(7);
        let response = Barrier::new(7);
        thread::scope(|scope| {
            let (state, retail, started, response) = (&state, &retail, &started, &response);
            let mut handles = Vec::new();
            for kind in ["plan", "advice", "suggestions", "pairing", "ack", "error"] {
                handles.push(scope.spawn(move || {
                    let generation = state.lock().unwrap().generation();
                    started.wait();
                    response.wait(); // Delayed HTTP response; no state lock is held.
                    state
                        .apply(&generation, |local| {
                            prefetch(&retail.0, kind);
                            local.approved = true;
                            local.forgotten = false;
                            local.ready = true;
                            local.acknowledged.push(kind.into());
                            local.notices.push(kind.into());
                        })
                        .unwrap()
                }));
            }
            started.wait();
            {
                let mut local = state.lock().unwrap();
                local.invalidate();
                local.approved = false;
                local.forgotten = true;
                clear_helper(&retail.0).unwrap();
                write_status(
                    &retail.0,
                    &CompanionStatus {
                        pairing: "revoked".into(),
                        ..Default::default()
                    },
                )
                .unwrap();
            }
            let erased = retail.files();
            assert_ne!(erased, personal);
            response.wait();
            for handle in handles {
                assert!(handle.join().unwrap().is_none());
            }
            assert_eq!(retail.files(), erased);
        });
        let local = state.lock().unwrap();
        assert!(local.forgotten);
        assert!(!local.approved && !local.ready);
        assert!(local.acknowledged.is_empty() && local.notices.is_empty());
        drop(local);
        // Reconnecting starts another generation. The new result can be applied.
        let generation = {
            let mut local = state.lock().unwrap();
            local.invalidate();
            local.forgotten = false;
            local.generation()
        };
        assert_eq!(
            state
                .apply(&generation, |_| prefetch(&retail.0, "plan"))
                .unwrap(),
            Some(())
        );
        assert!(String::from_utf8_lossy(&retail.files()[0]).contains("UnboredExternalPlan = {"));
        assert!(String::from_utf8_lossy(&retail.files()[0]).contains("revoked"));
    }

    #[test]
    fn erasure_waits_for_an_applying_result_then_removes_it() {
        let retail = Retail::new("applying");
        let state = SyncState::new(());
        let generation = state.lock().unwrap().generation();
        let (entered, applying) = mpsc::channel();
        let (release, released) = mpsc::channel();
        thread::scope(|scope| {
            let (state, retail, generation) = (&state, &retail, &generation);
            let writer = scope.spawn(move || {
                state
                    .apply(generation, |_| {
                        entered.send(()).unwrap();
                        released.recv().unwrap(); // Simulate an in-progress local file operation.
                        prefetch(&retail.0, "plan");
                    })
                    .unwrap()
            });
            applying.recv().unwrap();
            let eraser = scope.spawn(|| {
                let mut local = state.lock().unwrap();
                local.invalidate();
                clear_helper(&retail.0).unwrap();
            });
            release.send(()).unwrap();
            assert_eq!(writer.join().unwrap(), Some(()));
            eraser.join().unwrap();
        });
        let erased = retail.files();
        assert_eq!(
            state
                .apply(&generation, |_| prefetch(&retail.0, "plan"))
                .unwrap(),
            None
        );
        assert_eq!(retail.files(), erased);
        assert!(!String::from_utf8_lossy(&erased[0]).contains("UnboredExternalPlan = {"));
    }

    #[test]
    fn failed_local_erasure_still_invalidates_in_flight_work_and_can_retry() {
        let retail = Retail::new("erase-failure");
        let state = SyncState::new(Local {
            approved: true,
            ..Default::default()
        });
        let generation = state.lock().unwrap().generation();
        let staging = retail.0.join("Interface/AddOns/Unbored_Plan/Plan.lua.tmp");
        fs::create_dir(&staging).unwrap();
        let result = state
            .apply(&generation, |local| {
                local.invalidate();
                local.approved = false;
                local.forgotten = true;
                clear_helper(&retail.0)
            })
            .unwrap()
            .unwrap();
        assert!(result.is_err());
        assert_eq!(
            state
                .apply(&generation, |local| local.approved = true)
                .unwrap(),
            None
        );
        assert!(state.lock().unwrap().forgotten);
        fs::remove_dir(&staging).unwrap();
        let current = state.lock().unwrap().generation();
        state
            .apply(&current, |_| clear_helper(&retail.0))
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            state
                .apply(&generation, |_| prefetch(&retail.0, "plan"))
                .unwrap(),
            None
        );
    }

    #[test]
    fn generations_from_different_states_and_replaced_settings_are_not_interchangeable() {
        let first = SyncState::new("first");
        let second = SyncState::new("second");
        let old = first.lock().unwrap().generation();
        assert_eq!(second.apply(&old, |value| **value = "wrong").unwrap(), None);
        let current = {
            let mut value = first.lock().unwrap();
            value.invalidate();
            **value = "new settings";
            value.generation()
        };
        assert_eq!(first.apply(&old, |value| **value = "stale").unwrap(), None);
        assert_eq!(
            first.apply(&current, |value| **value).unwrap(),
            Some("new settings")
        );
    }
}
