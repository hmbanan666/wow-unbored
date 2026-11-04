-- Exact localized entity lookup and ordered quest-line membership.
CREATE INDEX game_rows_name ON game.rows (build, table_name, locale, (COALESCE(body ->> 'Display_lang', body ->> 'Name_lang', body ->> 'QuestTitle_lang', body ->> 'Title_lang')), id);
CREATE INDEX game_questlinexquest_questlineid ON game.rows (build, locale, (body ->> 'QuestLineID')) WHERE table_name = 'QuestLineXQuest';
ANALYZE game.rows;
