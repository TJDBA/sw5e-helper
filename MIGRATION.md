# Migration Map

## File Mappings

| Current File                       | New Location                        | Status | AI Tool     |
| ---------------------------------- | ----------------------------------- | ------ | ----------- |
| scripts/api.js                     | scripts/api.js + workflow/actions/* | ⬜     | Claude Code |
| scripts/core/engine/attack.js      | workflow/actions/attack.js          | ⬜     | ChatGPT     |
| scripts/core/engine/damage.js      | workflow/actions/damage.js          | ⬜     | ChatGPT     |
| scripts/core/chat/card-renderer.js | ui/cards/renderer.js                | ⬜     | Gemini      |
| scripts/core/chat/card-handlers.js | ui/cards/handlers.js                | ⬜     | Gemini      |
| scripts/ui/AttackDialog.js         | ui/dialogs/AttackDialog.js          | ⬜     | Claude Code |
| scripts/ui/DamageDialog.js         | ui/dialogs/DamageDialog.js          | ⬜     | Claude Code |

## Functions to Extract

- [ ] DiceRoller from attack.js → core/dice/roller.js
- [ ] Formula functions from damage.js → core/dice/formula.js
- [ ] Token resolution from adapter → core/actors/resolver.js
