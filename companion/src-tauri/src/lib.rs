//! File bridge between an outside planner and the Unbored addon.
//! No process memory, no injection, no attachment to Wow.exe.

pub mod addon;
pub mod device;
pub mod endpoint;
pub mod plan;
pub mod savedvars;
pub mod wow;

#[cfg(feature = "gui")]
mod gui;

pub fn run() {
    #[cfg(feature = "gui")]
    gui::run();
    #[cfg(not(feature = "gui"))]
    eprintln!("Unbored Companion was built without the gui feature.");
}
