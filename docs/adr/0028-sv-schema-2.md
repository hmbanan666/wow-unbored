# 0028. SavedVariables schema 2, Sections, Packed id sets, size budget

Status: accepted

`UnboredCharDB.data` and `UnboredDB.data` are `{ schema = 2, sections = { name = { v, at, src, body } }, dropped }`; the addon always keeps full current state, never diffs (D52, D55). Big id sets are Packed id sets: sorted, delta-encoded, base36, comma-joined, in chunks of at most 4,000 characters after an `"ids1"` tag, with one Lua packer and Rust/TS unpackers tested on one fixture (D53). Per file the target is 400 KB (Character) / 300 KB (Account), hard cap 1 MB and fewer than 30k unique literals; over cap the lowest-priority Sections are dropped and listed in `dropped` (D54).
