import { registerPack } from "./registry.js";

registerPack({
  id: "example",
  name: "Example Pack",
  available: (actor, weapon, state) => false,

  ui: (state) => ({
    section: "Class Options - Example",
    controls: [{ id: "extraDie", label: "Add 1d4 energy", type: "checkbox", default: false }]
  }),

  cost: (state) => ({ fp: 0 }),
  damage: (actor, weapon, state) => {
    if (!state?.packs?.example?.extraDie) return { parts: [] };
    return { parts: [{ formula: "1d4", type: "energy", label: "Example die", critEligible: true }] };
  }
});
