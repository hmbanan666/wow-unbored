//! Local sync results belong to the settings/Device generation that started them.
//! Capture under `lock`, do network work unlocked, then use `apply` for effects.

use std::ops::{Deref, DerefMut};
use std::sync::{Arc, LockResult, Mutex, MutexGuard};

#[derive(Clone)]
pub(crate) struct Generation(Arc<()>);

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
        self.generation = Generation(Arc::new(()));
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
            generation: Generation(Arc::new(())),
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
