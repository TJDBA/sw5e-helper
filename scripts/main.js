import { API } from "./api.js";

Hooks.once("init", () => {
  game.modules.get("sw5e-helper").api = API;
  game.i18n.register("sw5e-helper", "lang/en.json");
});

Hooks.once("ready", async () => {
  // Nothing heavy. No polling. Non-intrusive.
  console.log("SW5E Helper ready.");
});

// Optional: register a minimal client setting to control chat verbosity later
game.settings.register("sw5e-helper", "chatVerbose", {
  name: "Verbose Formula in Chat",
  scope: "client", config: true, type: Boolean, default: true
});
