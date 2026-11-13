# 0100. One release zip for Retail and Forever

Status: accepted (2026-11-13)

Following [0094 §7](0094-forever-port-professions-and-character-history.md), the Release workflow runs the BigWigs packager without `-g`. With `-g retail` the packager rewrote the packaged `## Interface:` line to the Retail values only, so the published zip dropped `16001` and did not load in WoW Forever although `addon/Unbored.toc` lists it. Without `-g` the packager builds one multi-version zip that keeps the source line (`120107, 120105, 120100, 16001`), and its `release.json` lists the `mainline` and `forever` flavors.
`scripts/check-packaged-toc.sh` runs after packaging in both the tag run and the dry run and fails when any source Interface value, or `16001`, is missing from the packaged TOC.
Catalog uploads stay gated by project ids and tokens ([0090](0090-addon-catalog-listings.md)); when they are set, the packager offers the file for every game version in the TOC, and a catalog that rejects the Forever version fails visibly rather than silently. Listings keep "Retail only" until the owner's in-game check of the released Forever build (0094 §7); the zip itself loading in Forever makes no public compatibility claim.
