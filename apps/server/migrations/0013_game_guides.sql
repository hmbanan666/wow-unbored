-- Indexed relationships for place lookup and instance guides.
CREATE INDEX game_uimapgroupmember_uimapid ON game.rows (build, locale, (body ->> 'UiMapID')) WHERE table_name = 'UiMapGroupMember';
CREATE INDEX game_criteriatree_parent ON game.rows (build, locale, (body ->> 'Parent')) WHERE table_name = 'CriteriaTree';
CREATE INDEX game_journalinstance_mapid ON game.rows (build, locale, (body ->> 'MapID')) WHERE table_name = 'JournalInstance';
CREATE INDEX game_journalencounter_journalinstanceid ON game.rows (build, locale, (body ->> 'JournalInstanceID')) WHERE table_name = 'JournalEncounter';
CREATE INDEX game_journalencounter_dungeonencounterid ON game.rows (build, locale, (body ->> 'DungeonEncounterID')) WHERE table_name = 'JournalEncounter';

ANALYZE game.rows;
