//! The one status line the window and tray show, in plain words.

pub const MASCOT_NAME: &str = "Wisp";

/// How long "press Load in game" stays up after a plan or answer arrives.
pub const READY_SECONDS: u64 = 15 * 60;

#[derive(Debug, Clone, Default)]
pub struct MoodInput {
    pub busy: Option<String>,
    pub pairing: String,
    pub needs_wow_path: bool,
    pub error: bool,
    /// Kind (plan, item, question) and unix time of the last delivered reply.
    pub ready: Option<(String, u64)>,
    pub request_pending: bool,
    pub now: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mood {
    /// idle, thinking, busy, ready, pairing, setup, or error. The window
    /// picks the mascot picture from it.
    pub phase: &'static str,
    pub headline: String,
}

fn mood(phase: &'static str, headline: impl Into<String>) -> Mood {
    Mood {
        phase,
        headline: headline.into(),
    }
}

pub fn ready_text(kind: &str) -> &'static str {
    match kind {
        "plan" => "Plan ready, press Load in game",
        _ => "I have an answer, press Load in game",
    }
}

pub fn current(input: &MoodInput) -> Mood {
    if let Some(busy) = &input.busy {
        return mood("busy", busy.clone());
    }
    if input.needs_wow_path {
        return mood("setup", "Show me where World of Warcraft is");
    }
    match input.pairing.as_str() {
        "approved" => {}
        "revoked" => return mood("error", "This PC was disconnected from the planner"),
        _ => return mood("pairing", "Waiting for approval"),
    }
    if input.error {
        return mood("error", "Can't reach the planner right now. I'll keep trying");
    }
    if let Some((kind, at)) = &input.ready {
        if input.now.saturating_sub(*at) < READY_SECONDS {
            return mood("ready", ready_text(kind));
        }
    }
    if input.request_pending {
        return mood("thinking", "Thinking about your request...");
    }
    mood("idle", "All set, go play")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_one_plain_status() {
        let mut input = MoodInput {
            pairing: "pending".into(),
            now: 1_000,
            ..Default::default()
        };
        assert_eq!(current(&input).headline, "Waiting for approval");
        input.pairing = "approved".into();
        input.needs_wow_path = true;
        assert_eq!(current(&input).phase, "setup");
        input.needs_wow_path = false;
        assert_eq!(current(&input).headline, "All set, go play");
        input.request_pending = true;
        assert_eq!(current(&input).phase, "thinking");
        input.ready = Some(("plan".into(), 900));
        assert_eq!(current(&input).headline, "Plan ready, press Load in game");
        input.ready = Some(("item".into(), 900));
        assert_eq!(current(&input).headline, "I have an answer, press Load in game");
        input.now = 900 + READY_SECONDS;
        assert_eq!(current(&input).phase, "thinking");
        input.error = true;
        assert_eq!(current(&input).phase, "error");
        input.busy = Some("Updating addon...".into());
        assert_eq!(current(&input).headline, "Updating addon...");
    }
}
