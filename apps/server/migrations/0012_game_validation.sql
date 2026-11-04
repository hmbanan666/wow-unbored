-- Indexed relationships used by Plan validation; no new game tables.
CREATE INDEX game_toy_itemid ON game.rows (build, locale, (body ->> 'ItemID')) WHERE table_name = 'Toy';
CREATE INDEX game_mount_sourcespellid ON game.rows (build, locale, (body ->> 'SourceSpellID')) WHERE table_name = 'Mount';
CREATE INDEX game_battlepetspecies_summonspellid ON game.rows (build, locale, (body ->> 'SummonSpellID')) WHERE table_name = 'BattlePetSpecies';
CREATE INDEX game_battlepetspecies_creatureid ON game.rows (build, locale, (body ->> 'CreatureID')) WHERE table_name = 'BattlePetSpecies';
CREATE INDEX game_uimapassignment_uimapid ON game.rows (build, locale, (body ->> 'UiMapID')) WHERE table_name = 'UiMapAssignment';
CREATE INDEX game_questpoiblob_questid ON game.rows (build, locale, (body ->> 'QuestID')) WHERE table_name = 'QuestPOIBlob';
CREATE INDEX game_questpoiblob_uimapid ON game.rows (build, locale, (body ->> 'UiMapID')) WHERE table_name = 'QuestPOIBlob';
CREATE INDEX game_questpoipoint_questpoiblobid ON game.rows (build, locale, (body ->> 'QuestPOIBlobID')) WHERE table_name = 'QuestPOIPoint';
CREATE INDEX game_taxinodes_continentid ON game.rows (build, locale, (body ->> 'ContinentID')) WHERE table_name = 'TaxiNodes';
CREATE INDEX game_journalencounter_uimapid ON game.rows (build, locale, (body ->> 'UiMapID')) WHERE table_name = 'JournalEncounter';
