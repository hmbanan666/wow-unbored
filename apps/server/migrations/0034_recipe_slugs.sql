-- ADR 0102: addresses outlive catalog rebuilds and English-name corrections.
CREATE TABLE game.recipe_slugs (
  game TEXT NOT NULL CHECK (game IN ('forever', 'retail')),
  spell_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  PRIMARY KEY (game, spell_id),
  UNIQUE (game, slug)
);

CREATE FUNCTION game.reserve_recipe_slug(target_game TEXT, target_spell INTEGER, english_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base TEXT := trim(both '-' from regexp_replace(lower(english_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'));
  candidate TEXT;
BEGIN
  IF english_name IS NULL OR trim(english_name) = '' THEN RETURN; END IF;
  -- Serialize imports per game; existing addresses always win, even after a rename.
  PERFORM pg_advisory_xact_lock(hashtext('recipe-slugs:' || target_game));
  IF EXISTS (SELECT 1 FROM game.recipe_slugs WHERE game = target_game AND spell_id = target_spell) THEN RETURN; END IF;
  IF base = '' THEN base := 'recipe-' || target_spell; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM game.recipe_slugs WHERE game = target_game AND slug = candidate) LOOP
    candidate := candidate || '-' || target_spell;
  END LOOP;
  INSERT INTO game.recipe_slugs VALUES (target_game, target_spell, candidate);
END $$;

-- Seed in a reproducible order; all later builds retain these assignments.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT p.game, p.spell_id, p.body->>'name' AS name
    FROM game.profession_recipes p JOIN game.builds b USING (game, build)
    ORDER BY b.build_number, p.game, p.spell_id, p.skill_line
  LOOP
    PERFORM game.reserve_recipe_slug(r.game, r.spell_id, r.name);
  END LOOP;
END $$;

CREATE FUNCTION game.recipe_slug_on_import() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM game.reserve_recipe_slug(NEW.game, NEW.spell_id, NEW.body->>'name');
  RETURN NEW;
END $$;
CREATE TRIGGER recipe_slug_on_import AFTER INSERT OR UPDATE OF body ON game.profession_recipes
FOR EACH ROW EXECUTE FUNCTION game.recipe_slug_on_import();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
    GRANT SELECT ON game.recipe_slugs TO unbored_web;
  END IF;
END $$;
