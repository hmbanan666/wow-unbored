# 0053. Player taste

Status: accepted

The Server learns Taste per Account over 60 days and per category (idea kind, `preset:<topic>`, `surprise`): picks, finished plans, done and skipped Steps and wins, joining progress to its plan through the optional progress `generatedAt` and `plans.generated_at`. A category with at least 3 picks gets a bonus of at most ±15 on Suggestion and Ready now scores; ideas shown but not picked are not counted yet (D189-D192). This amends [0040](0040-suggestions-from-data.md).
