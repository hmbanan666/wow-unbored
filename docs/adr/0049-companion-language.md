# 0049. Companion language

Status: accepted

The Companion speaks the language Bory speaks: the `lang` of the latest `char` Section on this PC, else the Windows UI language, else English; English and Russian, with no setting. Every visible string comes from one table per language in `i18n.rs`, and the NSIS installer picks English or Russian from Windows without asking (D156-D158).
