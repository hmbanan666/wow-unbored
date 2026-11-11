import { expect, test } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import ProfessionRoute from "../../app/components/ProfessionRoute.vue";
import { computeSkillRoute } from "@unbored/contracts/skill-route";

for (const game of ["forever", "retail"] as const)
  test(`${game} skill Plan shows stops, reagent prices and odds`, () => {
    const route = computeSkillRoute({
      game,
      skillLine: 197,
      skill: 50,
      max: 75,
      target: 52,
      known: [],
      recipes: [
        {
          spellId: 100,
          skillLine: 197,
          name: "Linen cloth",
          minSkill: 1,
          trainer: true,
          thresholds: { orange: 1, yellow: 60, green: 80, grey: 100 },
          skillUps: 1,
          acquireMethod: 0,
          category: { id: 1, name: "Cloth", order: 1 },
          reagents: [
            { itemId: 10, count: 2 },
            { itemId: 20, count: 1 },
          ],
          craftedItems: [],
          teachingItems: [],
        },
      ],
      prices: { 10: 7 },
    });
    const wrapper = mount(ProfessionRoute, { props: { route } });
    expect(wrapper.text()).toContain("Learn Linen cloth");
    expect(wrapper.text()).toContain("50 to 52");
    expect(wrapper.text()).toContain("2 expected crafts");
    expect(wrapper.text()).toContain("28 copper");
    expect(wrapper.text()).toContain("Price unknown");
    expect(wrapper.find("details").text()).toContain("(grey - skill) / (grey - yellow)");
  });

test("at cap and missing catalog show a next action instead of an empty list", () => {
  const input = {
    game: "forever" as const,
    skillLine: 197,
    skill: 300,
    max: 300,
    recipes: [],
    known: [],
  };
  const wrapper = mount(ProfessionRoute, { props: { route: computeSkillRoute(input) } });
  expect(wrapper.text()).toContain("cap");
  expect(wrapper.find("ol").exists()).toBe(false);
  const empty = mount(ProfessionRoute, {
    props: { route: computeSkillRoute({ ...input, skill: 50 }) },
  });
  expect(empty.text()).toContain("Visit a profession trainer");
});

for (const game of ["forever", "retail"] as const)
  test(`${game} at maximum only offers rank training in Forever`, () => {
    const input = {
      game,
      name: "Tailoring",
      skillLine: 197,
      skill: 75,
      max: 75,
      recipes: [],
      known: [],
    };
    const missing = mount(ProfessionRoute, { props: { route: computeSkillRoute(input) } });
    if (game === "retail") {
      expect(missing.text()).toContain("You have reached this cap");
      expect(missing.text()).not.toContain("Train the next rank");
      expect(missing.find("ol").exists()).toBe(false);
      return;
    }
    expect(missing.text()).toContain("Train the next rank of Tailoring at a trainer");
    expect(missing.text()).not.toContain("expected crafts");
    expect(missing.text()).not.toContain("Visit Teacher");
    const observed = mount(ProfessionRoute, {
      props: {
        route: computeSkillRoute({
          ...input,
          rankTrainer: { npcId: 123, npcName: "Teacher", uiMapID: 37, x: 12, y: 34 },
        }),
      },
    });
    expect(observed.text()).toContain("Visit Teacher (12, 34)");
    expect(observed.text()).not.toContain("level");
  });
