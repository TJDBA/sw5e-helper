// scripts/register.js
export const MODULE_ID = "sw5e-helper";

// Import once so our hooks/event delegation register at world load.
//import "./core/chat-handlers.js";

Hooks.once("init", () => {
  const base = game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;
  // Preload only the dialogs we already use. No UI redesign.
  loadTemplates([
    `${base}/templates/attack-dialog.hbs`,
    `${base}/templates/damage-dialog.hbs`
  ]);
});

import { API } from "./api.js";

Hooks.once("ready", () => {
  const mod = game.modules.get("sw5e-helper");
  mod.api = API;                 // module-scoped API
  // optional: globalThis.SW5EHELPER = API;
});