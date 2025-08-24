// scripts/core/chat/card-handlers.js
// SW5E Helper - Simplified Card Handlers
// Now uses command pattern for clean action dispatching

import { executeCardAction } from "./index.js";
import { ConfigHelper } from "../../config.js";

/* ----------------------------- bootstrap ----------------------------- */

Hooks.on("renderChatMessage", (message, html) => {
  const root = html[0]?.querySelector?.(".sw5e-helper-card");
  if (!root) return;
  
  // Single delegated event listener
  root.addEventListener("click", (ev) => _onCardClick(ev, message));
});

/* ------------------------------ main handler ----------------------------- */

async function _onCardClick(ev, message) {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  
  ev.preventDefault();
  ev.stopPropagation();

  const actionName = el.dataset.action;
  const state = _getState(message);
  
  if (!state) {
    ConfigHelper.debug("cards", "No state found in message", { messageId: message.id });
    return;
  }

  // Build action context
  const context = {
    element: el,
    ref: el.dataset.targetRef || el.closest(".target-row")?.dataset?.targetRef || null,
    messageId: message.id,
    userId: game.user.id
  };

  ConfigHelper.debug("cards", "Card action triggered", { 
    action: actionName, 
    ref: context.ref,
    messageId: context.messageId 
  });

  // Dispatch to action system
  await executeCardAction(actionName, message, state, context);
}

/* ----------------------------- helpers ----------------------------- */

function _getState(message) {
  return message?.flags?.["sw5e-helper"]?.state ?? null;
}

export { }