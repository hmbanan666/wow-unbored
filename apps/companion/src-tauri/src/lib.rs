//! File bridge between an outside planner and the Unbored addon.
//! No process memory, no injection, no attachment to Wow.exe.

pub mod account;
pub mod addon;
pub mod device;
pub mod endpoint;
pub mod i18n;
pub mod mood;
pub mod plan;
pub mod request;
pub mod savedvars;
pub mod snapshot;
pub mod wow;

#[cfg(feature = "gui")]
mod gui;

pub fn run() {
    #[cfg(feature = "gui")]
    gui::run();
    #[cfg(not(feature = "gui"))]
    eprintln!("Unbored Companion was built without the gui feature.");
}
