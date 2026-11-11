<script setup lang="ts">
import type { SkillRoute } from "@unbored/contracts/skill-route";
defineProps<{ route: SkillRoute; name?: string }>();
const odds =
  "Orange gives a skill point with every craft. Yellow and green use (grey - skill) / (grey - yellow), between 0 and 1. Green is a slow fallback; grey gives no points. Crafts are estimates, not guarantees.";
const count = (n: number) => Number(n.toFixed(2));
</script>

<template>
  <section class="profession-route">
    <h3>{{ name || "Profession" }} skill Plan</h3>
    <p v-if="route.status === 'at_cap'">
      You have reached this cap. Pick another profession or explore your missing recipes below.
    </p>
    <div v-else-if="route.rankTraining">
      <p>Train the next rank of {{ name || route.rankTraining.profession }} at a trainer.</p>
      <p v-if="route.rankTraining.trainer">
        Visit {{ route.rankTraining.trainer.npcName
        }}<template
          v-if="
            route.rankTraining.trainer.uiMapID &&
            route.rankTraining.trainer.x !== null &&
            route.rankTraining.trainer.y !== null
          "
        >
          ({{ route.rankTraining.trainer.x }}, {{ route.rankTraining.trainer.y }})</template
        >.
      </p>
      <p>
        Your current rank cap is {{ route.rankTraining.previousMax }}. Crafting can continue after
        it increases.
      </p>
    </div>
    <template v-else>
      <p v-if="route.from !== null && route.target !== null">
        Skill {{ route.from }} to {{ route.target }}
      </p>
      <ol v-if="route.stretches.length">
        <li v-for="stretch in route.stretches" :key="`${stretch.spellId}:${stretch.from}`">
          <p v-if="stretch.trainer">
            Learn {{ stretch.name }}:
            <template v-if="stretch.trainer !== 'catalog'">
              visit {{ stretch.trainer.npcName }}, {{ stretch.trainer.zone
              }}<template v-if="stretch.trainer.x !== null && stretch.trainer.y !== null">
                ({{ stretch.trainer.x }}, {{ stretch.trainer.y }})</template
              >.
              {{
                stretch.trainer.cost === null ? "Price unknown" : `${stretch.trainer.cost} copper`
              }}
            </template>
            <template v-else>visit your profession trainer. Price unknown</template>
          </p>
          <p>
            <strong>{{ stretch.name }}</strong
            >, {{ stretch.from }} to {{ stretch.to }}: {{ count(stretch.expectedCrafts) }} expected
            crafts<span v-if="stretch.slow">. Slow skill gains</span>
          </p>
          <ul>
            <li v-for="reagent in stretch.reagents" :key="reagent.itemId">
              {{ reagent.name || "Reagent name unavailable" }}: {{ reagent.count }}.
              {{ reagent.totalCopper === null ? "Price unknown" : `${reagent.totalCopper} copper` }}
            </li>
          </ul>
        </li>
      </ol>
      <p v-if="route.status !== 'complete'">
        Bory needs more recipe information<template v-if="route.stretches.length">
          after skill {{ route.reached }}</template
        >. Visit a profession trainer and open your profession window, then let the Companion catch
        up.
      </p>
      <template v-if="route.reagents.length">
        <h4>Reagent totals</h4>
        <ul>
          <li v-for="reagent in route.reagents" :key="reagent.itemId">
            {{ reagent.name || "Reagent name unavailable" }}: {{ reagent.count }}.
            {{ reagent.totalCopper === null ? "Price unknown" : `${reagent.totalCopper} copper` }}
          </li>
        </ul>
        <p>Totals round each stretch up to whole crafts. Vendor prices are from past visits.</p>
      </template>
      <details>
        <summary :title="odds">How orange, yellow and green skill gains work</summary>
        <p>{{ odds }}</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.profession-route {
  margin-block: 1rem;
}
ol,
ul {
  padding-inline-start: 1.4rem;
}
li {
  margin-block: 0.5rem;
}
summary {
  cursor: pointer;
}
</style>
