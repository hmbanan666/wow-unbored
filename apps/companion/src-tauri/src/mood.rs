//! The one status line the window and tray show, in plain words.

use crate::i18n::{tr_in, trf_in, Lang};

pub const MASCOT_NAME: &str = "Bory";

/// How long "ready in the game" stays up after a plan or answer arrives.
pub const READY_SECONDS: u64 = 15 * 60;

/// How long "Connected!" stays up after the planner approves this PC.
pub const CONNECTED_SECONDS: u64 = 10 * 60;

#[derive(Debug, Clone, Default)]
pub struct MoodInput {
    pub busy: Option<String>,
    /// pending, approved, or revoked; empty before the planner answered once.
    pub pairing: String,
    pub needs_wow_path: bool,
    pub error: bool,
    /// Kind (plan, item, question) and unix time of the last delivered reply.
    pub ready: Option<(String, u64)>,
    pub request_pending: bool,
    /// When this PC was approved, if it happened while the app was running.
    pub connected_at: Option<u64>,
    /// When the addon was updated while the game was running.
    pub addon_updated_at: Option<u64>,
    /// This PC's name, as the planner sees it.
    pub machine: String,
    /// The player used Forget my data; the planner revoked this PC then.
    pub forgotten: bool,
    pub now: u64,
    pub lang: Lang,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mood {
    /// idle, thinking, busy, ready, pairing, setup, or error.
    pub phase: &'static str,
    /// Bory's picture for the phase, from MOOD_FOR_PHASE.
    pub picture: &'static str,
    pub headline: String,
    /// One line under the headline: what happens next, or what to do.
    pub hint: String,
}

/// D149: one picture per phase, the same moods the addon uses (idle,
/// thinking, waiting, happy). A new mood is one more line; nothing animates.
pub const MOOD_FOR_PHASE: &[(&str, &str)] = &[
    ("idle", "idle"),
    ("setup", "idle"),
    ("busy", "thinking"),
    ("thinking", "thinking"),
    ("pairing", "waiting"),
    ("error", "waiting"),
    ("ready", "happy"),
];

pub fn picture(phase: &str) -> &'static str {
    MOOD_FOR_PHASE
        .iter()
        .find(|(name, _)| *name == phase)
        .map(|(_, picture)| *picture)
        .unwrap_or("idle")
}

fn mood(phase: &'static str, headline: impl Into<String>, hint: impl Into<String>) -> Mood {
    Mood {
        phase,
        picture: picture(phase),
        headline: headline.into(),
        hint: hint.into(),
    }
}

pub fn ready_text(lang: Lang, kind: &str) -> String {
    match kind {
        "plan" => tr_in(lang, "READY_PLAN"),
        _ => tr_in(lang, "READY_ANSWER"),
    }
}

fn recent(at: Option<u64>, now: u64, seconds: u64) -> bool {
    at.is_some_and(|at| now.saturating_sub(at) < seconds)
}

pub fn current(input: &MoodInput) -> Mood {
    let lang = input.lang;
    let t = |key: &str| tr_in(lang, key);
    if let Some(busy) = &input.busy {
        return mood("busy", busy.clone(), "");
    }
    if input.needs_wow_path {
        return mood("setup", t("SETUP_HEAD"), t("SETUP_HINT"));
    }
    if input.error {
        return mood("error", t("ERROR_HEAD"), t("ERROR_HINT"));
    }
    match input.pairing.as_str() {
        "approved" => {}
        "revoked" if input.forgotten => return mood("idle", t("FORGOT_HEAD"), t("FORGOT_HINT")),
        "revoked" => return mood("error", t("REVOKED_HEAD"), t("REVOKED_HINT")),
        "" => return mood("pairing", t("CONNECTING"), ""),
        _ => {
            return mood(
                "pairing",
                t("PAIRING_HEAD"),
                trf_in(lang, "PAIRING_HINT", &[&input.machine]),
            )
        }
    }
    if recent(input.addon_updated_at, input.now, READY_SECONDS) {
        return mood("ready", t("UPDATED_HEAD"), t("UPDATED_HINT"));
    }
    if let Some((kind, at)) = &input.ready {
        if recent(Some(*at), input.now, READY_SECONDS) {
            return mood("ready", ready_text(lang, kind), t("READY_HINT"));
        }
    }
    if recent(input.connected_at, input.now, CONNECTED_SECONDS) {
        return mood("ready", t("CONNECTED_HEAD"), t("CONNECTED_HINT"));
    }
    if input.request_pending {
        return mood("thinking", t("THINKING_HEAD"), t("THINKING_HINT"));
    }
    mood("idle", t("IDLE_HEAD"), t("IDLE_HINT"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_one_plain_status() {
        let mut input = MoodInput {
            pairing: String::new(),
            machine: "GAMING-PC".into(),
            now: 1_000,
            ..Default::default()
        };
        assert_eq!(current(&input).headline, "Connecting...");
        input.pairing = "pending".into();
        assert_eq!(current(&input).headline, "Waiting for a one-time OK");
        assert!(current(&input).hint.contains("GAMING-PC"));
        input.pairing = "approved".into();
        input.needs_wow_path = true;
        assert_eq!(current(&input).phase, "setup");
        input.needs_wow_path = false;
        assert_eq!(current(&input).headline, "All set, go play");
        input.connected_at = Some(990);
        assert_eq!(current(&input).headline, "Connected! You're all set");
        input.request_pending = true;
        assert_eq!(current(&input).phase, "ready");
        input.connected_at = Some(0);
        assert_eq!(current(&input).phase, "thinking");
        input.ready = Some(("plan".into(), 900));
        assert_eq!(current(&input).headline, "Your plan is ready in the game");
        assert!(current(&input).hint.contains("Refresh"));
        input.ready = Some(("item".into(), 900));
        assert_eq!(current(&input).headline, "Your answer is ready in the game");
        input.addon_updated_at = Some(950);
        assert_eq!(
            current(&input).headline,
            "Bory was updated, press Load in game"
        );
        input.addon_updated_at = None;
        input.now = 900 + READY_SECONDS;
        assert_eq!(current(&input).phase, "thinking");
        input.pairing = "revoked".into();
        assert_eq!(current(&input).headline, "This PC was disconnected");
        input.forgotten = true;
        assert_eq!(
            current(&input).headline,
            "Done. I forgot everything about you"
        );
        assert!(current(&input).hint.contains("Connect again"));
        input.forgotten = false;
        input.pairing = "pending".into();
        input.error = true;
        assert_eq!(current(&input).phase, "error");
        assert!(!current(&input).hint.contains("Planner returned"));
        input.busy = Some("Updating addon...".into());
        assert_eq!(current(&input).headline, "Updating addon...");
    }

    #[test]
    fn every_phase_has_one_of_the_four_pictures() {
        let pictures = ["idle", "thinking", "waiting", "happy"];
        for phase in [
            "idle", "setup", "busy", "thinking", "pairing", "error", "ready",
        ] {
            assert!(pictures.contains(&picture(phase)), "{phase}");
        }
        assert_eq!(picture("error"), "waiting", "an error: Bory waits");
        assert_eq!(picture("ready"), "happy");
        assert_eq!(picture("thinking"), "thinking");
        assert_eq!(picture("nope"), "idle");
    }

    #[test]
    fn speaks_russian_when_asked() {
        let input = MoodInput {
            pairing: "pending".into(),
            machine: "GAMING-PC".into(),
            lang: Lang::Ru,
            ..Default::default()
        };
        let mood = current(&input);
        assert_eq!(mood.headline, "Жду разового одобрения");
        assert!(mood.hint.contains("GAMING-PC"));
        assert_eq!(ready_text(Lang::Ru, "plan"), "Твой план ждёт в игре");
    }
}
