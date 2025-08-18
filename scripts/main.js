import { API } from "./api.js";

Hooks.once("init", () => {
  game.modules.get("sw5e-helper").api = API;
  console.log("SW5E Helper: init");
});

Hooks.once("ready", () => {
  console.log("SW5E Helper: ready");
});

// Clickable target names in our chat cards
Hooks.on("renderChatMessage", (message, html) => {
  html.on("click", "a.sw5e-helper-target", ev => {
    ev.preventDefault(); ev.stopPropagation();
    const a = ev.currentTarget;
    const tokenId = a.dataset.token;
    const tok = canvas.tokens?.get(tokenId) || canvas.tokens?.placeables?.find(t => t.id === tokenId || t.document?.id === tokenId);
    if (!tok) return;
    canvas.ping(tok.center, { duration: 800, color: "#ff6400" });
    tok.control({ releaseOthers: true });
  });
});
