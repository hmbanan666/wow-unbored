# 0025. Grouped dependency updates

Status: accepted

JavaScript and Rust dependencies track current stable releases, including the `zip` crate at 9.1.3 (`ZipFile::name` now returns a result). Dependabot opens a weekly pull request per ecosystem that groups minor and patch updates; each major stays its own pull request. The `zip` 2 to 9 bump in Dependabot pull request 5 is done here, and that pull request is closed in favour of this one.
