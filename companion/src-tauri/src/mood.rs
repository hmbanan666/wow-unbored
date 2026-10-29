//! The one status line the window and tray show, in plain words.

pub const MASCOT_NAME: &str = "Wisp";

/// How long "press Load in game" stays up after a plan or answer arrives.
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
    pub now: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mood {
    /// idle, thinking, busy, ready, pairing, setup, or error. The window
    /// picks the mascot picture from it.
    pub phase: &'static str,
    pub headline: String,
    /// One line under the headline: what happens next, or what to do.
    pub hint: String,
}

fn mood(phase: &'static str, headline: impl Into<String>, hint: impl Into<String>) -> Mood {
    Mood {
        phase,
        headline: headline.into(),
        hint: hint.into(),
    }
}

pub fn ready_text(kind: &str) -> &'static str {
    match kind {
        "plan" => "Plan ready, press Load in game",
        _ => "I have an answer, press Load in game",
    }
}

fn recent(at: Option<u64>, now: u64, seconds: u64) -> bool {
    at.is_some_and(|at| now.saturating_sub(at) < seconds)
}

pub fn current(input: &MoodInput) -> Mood {
    if let Some(busy) = &input.busy {
        return mood("busy", busy.clone(), "");
    }
    if input.needs_wow_path {
        return mood(
            "setup",
            "Show me where World of Warcraft is",
            "I need your World of Warcraft folder to set up Wisp in the game.",
        );
    }
    if input.error {
        return mood(
            "error",
            "Can't reach the planner right now",
            "Check your internet connection. I'll keep trying every 30 seconds; quick plans in the game still work.",
        );
    }
    match input.pairing.as_str() {
        "approved" => {}
        "revoked" => {
            return mood(
                "error",
                "This PC was disconnected",
                "Ask the Unbored team to approve it again. Quick plans in the game still work.",
            )
        }
        "" => return mood("pairing", "Connecting...", ""),
        _ => {
            return mood(
                "pairing",
                "Waiting for a one-time OK",
                format!(
                    "This PC ({}) needs a one-time OK from the Unbored team. I check every 30 seconds; nothing to do here.",
                    input.machine
                ),
            )
        }
    }
    if recent(input.addon_updated_at, input.now, READY_SECONDS) {
        return mood(
            "ready",
            "Wisp was updated, press Load in game",
            "Click Load next to Wisp in the game to apply it.",
        );
    }
    if let Some((kind, at)) = &input.ready {
        if recent(Some(*at), input.now, READY_SECONDS) {
            return mood("ready", ready_text(kind), "Click Load next to Wisp in the game.");
        }
    }
    if recent(input.connected_at, input.now, CONNECTED_SECONDS) {
        return mood(
            "ready",
            "Connected! You're all set",
            "Start World of Warcraft and click Wisp to pick a plan.",
        );
    }
    if input.request_pending {
        return mood(
            "thinking",
            "Thinking about your request...",
            "Keep playing. I'll tell you when it's ready.",
        );
    }
    mood("idle", "All set, go play", "I'll bring your plans and answers into the game.")
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
        assert_eq!(current(&input).headline, "Plan ready, press Load in game");
        input.ready = Some(("item".into(), 900));
        assert_eq!(current(&input).headline, "I have an answer, press Load in game");
        input.addon_updated_at = Some(950);
        assert_eq!(current(&input).headline, "Wisp was updated, press Load in game");
        input.addon_updated_at = None;
        input.now = 900 + READY_SECONDS;
        assert_eq!(current(&input).phase, "thinking");
        input.pairing = "revoked".into();
        assert_eq!(current(&input).headline, "This PC was disconnected");
        input.pairing = "pending".into();
        input.error = true;
        assert_eq!(current(&input).phase, "error");
        assert!(!current(&input).hint.contains("Planner returned"));
        input.busy = Some("Updating addon...".into());
        assert_eq!(current(&input).headline, "Updating addon...");
    }
}
