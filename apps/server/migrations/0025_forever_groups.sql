-- Navigation metadata stays outside immutable publication bodies and timestamps.
ALTER TABLE content.paths ADD COLUMN IF NOT EXISTS guide_group text
  CONSTRAINT paths_guide_group CHECK (guide_group IS NULL OR (
    kind = 'guide' AND game = 'forever' AND guide_group IN (
      'first-steps', 'systems', 'classes', 'professions-gold', 'dungeons-raids',
      'mounts-riding', 'addons', 'comparisons')));
CREATE TABLE IF NOT EXISTS content.editorial_migrations (name text PRIMARY KEY);
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  expected jsonb := $groups$[
  {
    "slug": "best-solo-class-wow-forever",
    "group": "classes",
    "version": 2,
    "title": "Best Solo Class in WoW Forever: Choose Your Tradeoff",
    "description": "Start with Affliction Warlock for self-sufficient solo play, then compare Hunter, Paladin and Mage by recovery, safety and control.",
    "fingerprint": "92c0a3f21e3548347ceda80530920fec"
  },
  {
    "slug": "best-leveling-class-wow-forever",
    "group": "classes",
    "version": 2,
    "title": "Best Leveling Class in WoW Forever: Hunter or an Alternative?",
    "description": "Beast Mastery Hunter is the first leveling pick to consider. Compare its petless start and upkeep with Warlock recovery and Frost Mage control.",
    "fingerprint": "a88ca6b3af82b3eaf6f76e036b050733"
  },
  {
    "slug": "wow-forever-enchanting-guide",
    "group": "professions-gold",
    "version": 2,
    "title": "WoW Forever Enchanting: Start, Disenchant or Sell?",
    "description": "Start Enchanting, find Disenchant, compare gear with its dust or essences, and plan the Enchanted Lute and later camp crafts.",
    "fingerprint": "6bbbcc1d22bcf73058b1cd4b5b9d0bcc"
  },
  {
    "slug": "how-to-make-gold-early-in-wow-forever",
    "group": "professions-gold",
    "version": 2,
    "title": "How to Make Gold Early in WoW Forever: Gather and Spend Wisely",
    "description": "Choose gathering for your questing style, check Waylaid Crates before filling them, and protect training money without relying on launch price predictions.",
    "fingerprint": "64b56c57de6701d792ab6f7911713f55"
  },
  {
    "slug": "wow-forever-beginners-guide",
    "group": "first-steps",
    "version": 3,
    "title": "WoW Forever Beginner Guide: Your First Character and First Steps",
    "description": "Choose a preset and ruleset, check Skyborne access, and understand training, camps and Legacy before setting out in WoW Forever.",
    "fingerprint": "59a23f966c2faea1f9b6a6bf2431f2d0"
  },
  {
    "slug": "wow-forever-camping-guide",
    "group": "systems",
    "version": 1,
    "title": "WoW Forever Camping: Buffs and Camp Features",
    "description": "Build a campfire, choose a profession feature and combine camp benefits, food and your sleeping bag before heading back to questing.",
    "fingerprint": "70711bc19c07c6e8217c1edf74f8f6af"
  },
  {
    "slug": "wow-forever-cozy-sleeping-bag",
    "group": "systems",
    "version": 1,
    "title": "WoW Forever Sleeping Bag: Both Faction Routes",
    "description": "Follow the Horde or Alliance sleeping bag quest route, find the hidden objects and fit the journey around leveling, camping and food.",
    "fingerprint": "226154cfd87bbf5d74e2f0a8345b9be8"
  },
  {
    "slug": "wow-forever-legacy-talents",
    "group": "systems",
    "version": 1,
    "title": "WoW Forever Legacy Talents: Your First 16 Points",
    "description": "Earn Legacy points on one character, choose perks for solo leveling, professions or PvP, and understand camping bonuses and respec limits.",
    "fingerprint": "6755dfdaabd3b0883d5cfa378b41eea7"
  },
  {
    "slug": "wow-forever-enhanced-vs-classic-preset",
    "group": "systems",
    "version": 1,
    "title": "WoW Forever Enhanced or Classic: Which Preset?",
    "description": "Choose Enhanced or Classic with the six confirmed setting differences, then adjust quest guidance, bags and character appearance later.",
    "fingerprint": "4ec0289508355a6ef6681edddebc7ee1"
  }
]$groups$::jsonb;
  guide jsonb;
  current_page content.paths%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM content.editorial_migrations WHERE name = 'forever-groups-2026-11-09') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND game = 'forever' AND locale = 'en') THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM content.paths p WHERE p.kind = 'guide' AND p.game = 'forever'
      AND p.locale = 'en' AND p.status IN ('draft', 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected) e WHERE e->>'slug' = p.slug)) THEN
    RAISE EXCEPTION 'Forever group migration needs review: unexpected guide';
  END IF;
  FOR guide IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide'
      AND slug = guide->>'slug' AND locale = 'en' ORDER BY version DESC LIMIT 1;
    IF NOT FOUND OR current_page.game <> 'forever' OR current_page.status <> 'published'
        OR current_page.version <> (guide->>'version')::integer
        OR current_page.title <> guide->>'title' OR current_page.description <> guide->>'description'
        OR md5(current_page.body::text) <> guide->>'fingerprint'
        OR current_page.guide_group IS NOT NULL THEN
      RAISE EXCEPTION 'Forever group migration needs review for %: missing or changed publication, metadata or draft', guide->>'slug';
    END IF;
    UPDATE content.paths SET guide_group = guide->>'group' WHERE id = current_page.id;
  END LOOP;
  INSERT INTO content.editorial_migrations (name) VALUES ('forever-groups-2026-11-09');
END $migration$;
