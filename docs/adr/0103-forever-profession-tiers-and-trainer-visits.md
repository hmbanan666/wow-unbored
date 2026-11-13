# 0103. Forever profession tiers and trainer visits

Status: accepted (2026-11-13)

Forever 1.60.1 reads Enchanting through `C_TradeSkillUI` (there is no Craft API); the skill book also lists the expansion tier, which now stores `parentSkillLine` so it stays the same profession as the catalog line whose recipes were already read. A profession trainer visit is recorded when `IsTradeskillTrainer` is true or the trainer type is Tradeskills, including when the rank-step index is secret and when the skill name is missing but the service spell belongs to a catalog profession.
