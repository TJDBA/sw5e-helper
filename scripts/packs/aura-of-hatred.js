// scripts/packs/aura-of-hatred.js
// SW5E Helper - Aura of Hatred Feature Pack
// Simple passive damage bonus

import { PackRegistry } from "./pack-registry.js";

PackRegistry.register({
  id: "aura-of-hatred",
  name: "Aura of Hatred",
  
  requiredFeatureIds: ["aura-of-hatred"],
  
  available: (actor, weapon, context) => {
    const chrMod = actor.system?.abilities?.cha?.mod || 0;
    // Not available with separate rolls (aura affects all targets equally)
    return chrMod > 0 && !context.separate;
  },
  
  // Only in damage dialog - passive bonus
  renderDamageHTML: (actor, weapon, context) => {
    const chrMod = actor.system?.abilities?.cha?.mod || 0;
    const packState = context.packState?.['aura-of-hatred'] || {};
    
    // Show why it's disabled if separate rolls
    if (context.separate) {
      return `
        <div class="pack-feature">
          <label class="chk">
            <input type="checkbox" disabled>
            Aura of Hatred (+${chrMod} damage)
            <span class="note">Not available with separate rolls</span>
          </label>
        </div>
      `;
    }
    
    return `
      <div class="pack-feature">
        <label class="chk">
          <input type="checkbox" name="pack.aura-of-hatred.useAura" 
                 ${packState.useAura ? 'checked' : ''}>
          Aura of Hatred (+${chrMod} damage)
        </label>
      </div>
    `;
  },
  
  validateState: (packState, actor) => {
    if (!packState.useAura) return true;
    
    const chrMod = actor.system?.abilities?.cha?.mod || 0;
    if (chrMod <= 0) {
      throw new Error("Aura of Hatred requires positive Charisma modifier");
    }
    
    return true;
  },
  
  modifyDamage: (damageData, packState, actor) => {
    if (!packState.useAura) return damageData;
    
    const chrMod = actor.system?.abilities?.cha?.mod || 0;
    if (chrMod <= 0) return damageData;
    
    return {
      ...damageData,
      extraRows: [
        ...(damageData.extraRows || []),
        {
          id: 'aura-hatred',
          formula: String(chrMod),
          type: 'kinetic',
          inCrit: false, // Flat bonuses don't usually crit
          label: 'Aura of Hatred'
        }
      ]
    };
  }
  
  // No resource consumption - it's a passive ability
});

console.log("SW5E Helper: Aura of Hatred pack registered");