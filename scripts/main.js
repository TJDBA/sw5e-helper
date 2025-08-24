// scripts/main.js
// SW5E Helper - Main Module Entry Point
// Simplified initialization with pack system support

import { SW5E_CONFIG, ConfigHelper } from "./core/config.js";
import { PackRegistry } from "./packs/pack-registry.js";
import { API } from "./api.js";
import "./core/chat/actions/card-handlers.js";


// Import feature-based packs (one per feature, reusable across classes)
import "./packs/combat-superiority.js";
import "./packs/force-empowered-strikes.js";
import "./packs/aura-of-hatred.js";
// import "./packs/sneak-attack.js";
// import "./packs/rage.js";
// import "./packs/spell-sniper.js";

/* ----------------------------- Module Initialization ----------------------------- */

Hooks.once("init", async () => {
  ConfigHelper.debug("init", "SW5E Helper initializing...");
  
  // Initialize pack registry
  PackRegistry.initialize();
  
  // Preload templates
  const templatePaths = [
    ConfigHelper.getTemplatePath("ATTACK_DIALOG"),
    ConfigHelper.getTemplatePath("DAMAGE_DIALOG")
  ].filter(Boolean);
  
  if (templatePaths.length > 0) {
    try {
      await loadTemplates(templatePaths);
      ConfigHelper.debug("init", "Templates preloaded", { templatePaths });
    } catch (error) {
      console.error("SW5E Helper: Error preloading templates", error);
    }
  }
  
  // Expose API on module
  const module = game.modules.get(SW5E_CONFIG.MODULE.ID);
  if (module) {
    module.api = {
      ...API,
      PackRegistry,
      ConfigHelper,
      SW5E_CONFIG
    };
    
    // Make pack registration globally accessible for external packs
    globalThis.SW5EHelper = {
      PackRegistry,
      ConfigHelper,
      SW5E_CONFIG
    };
  }
  
  ConfigHelper.debug("init", "SW5E Helper initialized", {
    packsRegistered: PackRegistry.getPackSummaries().length,
    apiExposed: !!module?.api
  });
});

Hooks.once("ready", () => {
  ConfigHelper.debug("ready", "SW5E Helper ready");
  
  // Log pack status
  const packSummaries = PackRegistry.getPackSummaries();
  if (packSummaries.length > 0) {
    ConfigHelper.debug("ready", "Registered packs:", packSummaries);
  }
  
  // Register any Foundry-specific integrations
  registerFoundryIntegrations();
});

/* ----------------------------- Foundry Integrations ----------------------------- */

function registerFoundryIntegrations() {
  // Token name clicking in chat cards for targeting
  Hooks.on("renderChatMessage", (message, html) => {
    html.on("click", "a.sw5e-helper-target", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      
      const tokenId = ev.currentTarget.dataset.token;
      const token = canvas.tokens?.get(tokenId) || 
                   canvas.tokens?.placeables?.find(t => 
                     t.id === tokenId || t.document?.id === tokenId
                   );
      
      if (!token) return;
      
      // Ping and select token
      canvas.ping(token.center, { duration: 800, color: "#ff6400" });
      token.control({ releaseOthers: true });
    });
  });
  
  // Optional: Register keybindings for quick access
  if (game.keybindings) {
    try {
      game.keybindings.register(SW5E_CONFIG.MODULE.ID, "openAttackDialog", {
        name: "Open Attack Dialog",
        hint: "Opens the SW5E Helper attack dialog for the selected token",
        editable: [
          { key: "KeyA", modifiers: ["Control", "Shift"] }
        ],
        onDown: () => {
          const token = canvas.tokens?.controlled[0];
          if (token?.actor) {
            API.openAttack({ actor: token.actor });
          } else {
            ui.notifications.warn("Select a token first");
          }
        }
      });
      
      game.keybindings.register(SW5E_CONFIG.MODULE.ID, "openDamageDialog", {
        name: "Open Damage Dialog", 
        hint: "Opens the SW5E Helper damage dialog for the selected token",
        editable: [
          { key: "KeyD", modifiers: ["Control", "Shift"] }
        ],
        onDown: () => {
          const token = canvas.tokens?.controlled[0];
          if (token?.actor) {
            API.openDamage({ actor: token.actor });
          } else {
            ui.notifications.warn("Select a token first");
          }
        }
      });
      
      ConfigHelper.debug("ready", "Keybindings registered");
    } catch (error) {
      console.warn("SW5E Helper: Could not register keybindings", error);
    }
  }
}

/* ----------------------------- Development Helpers ----------------------------- */

// Expose development helpers in console for debugging
if (SW5E_CONFIG.DEBUG.ENABLED) {
  globalThis.SW5E_DEBUG = {
    config: SW5E_CONFIG,
    helper: ConfigHelper,
    packs: PackRegistry,
    api: API,
    
    // Helper functions for console debugging
    listPacks: () => PackRegistry.getPackSummaries(),
    testPack: (packId, actor, weapon) => {
      const pack = PackRegistry.packs.get(packId);
      if (!pack) return `Pack ${packId} not found`;
      
      const testActor = actor || canvas.tokens?.controlled[0]?.actor;
      const testWeapon = weapon || testActor?.items?.find(i => i.type === "weapon");
      
      if (!testActor) return "No actor provided or selected";
      
      return {
        available: pack.available(testActor, testWeapon, { type: 'attack' }),
        hasRequiredItems: PackRegistry.hasRequiredItems(testActor, pack),
        requiredItems: pack.requiredItems
      };
    },
    
    renderPackHTML: (packId, type = 'attack') => {
      const pack = PackRegistry.packs.get(packId);
      if (!pack) return `Pack ${packId} not found`;
      
      const actor = canvas.tokens?.controlled[0]?.actor;
      const weapon = actor?.items?.find(i => i.type === "weapon");
      
      if (!actor) return "No actor selected";
      
      const renderFunc = type === 'attack' ? pack.renderAttackHTML : pack.renderDamageHTML;
      if (!renderFunc) return `Pack ${packId} has no ${type} HTML renderer`;
      
      return renderFunc(actor, weapon, { type, packState: {} });
    }
  };
  
  console.log("SW5E Helper: Debug helpers available as globalThis.SW5E_DEBUG");
}

export { API };