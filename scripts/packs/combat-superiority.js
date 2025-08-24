// scripts/packs/combat-superiority.js
// SW5E Helper - Combat Superiority Feature Pack
// Simple: one feature, one pack

import { PackRegistry } from "./pack-registry.js";

PackRegistry.register({
  id: "combat-superiority",
  name: "Combat Superiority",
  
  // Simple ID list - let game engine validate these exist
  requiredFeatureIds: ["combat-superiority"],
  
  // Available if has superiority dice
  available: (actor, weapon, context) => {
    const dice = actor.system?.resources?.superiority?.value || 0;
    return dice > 0;
  },
  
  // Simple attack interface
  renderAttackHTML: (actor, weapon, context) => {
    const dice = actor.system?.resources?.superiority?.value || 0;
    const dieType = actor.system?.resources?.superiority?.die || "d8";
    const packState = context.packState?.['combat-superiority'] || {};
    
    return `
      <div class="pack-feature">
        <label class="chk">
          <input type="checkbox" name="pack.combat-superiority.useSuperiority" 
                 ${packState.useSuperiority ? 'checked' : ''}>
          Add Superiority Die (+1${dieType}) - ${dice} remaining
        </label>
      </div>
    `;
  },
  
  // Simple damage interface
  renderDamageHTML: (actor, weapon, context) => {
    const dieType = actor.system?.resources?.superiority?.die || "d8";
    const packState = context.packState?.['combat-superiority'] || {};
    
    // Show carry-over from attack
    if (packState.usedInAttack) {
      return `
        <div class="pack-feature">
          <span>✓ Superiority Die (1${dieType}) from attack will be added</span>
        </div>
      `;
    }
    
    // Or allow adding to damage
    const dice = actor.system?.resources?.superiority?.value || 0;
    return `
      <div class="pack-feature">
        <label class="chk">
          <input type="checkbox" name="pack.combat-superiority.useSuperiority" 
                 ${packState.useSuperiority ? 'checked' : ''}>
          Add Superiority Die (+1${dieType}) - ${dice} remaining
        </label>
      </div>
    `;
  },
  
  validateState: (packState, actor) => {
    if (packState.useSuperiority || packState.usedInAttack) {
      const dice = actor.system?.resources?.superiority?.value || 0;
      if (dice < 1) throw new Error("No superiority dice remaining");
    }
    return true;
  },
  
  modifyAttack: (attackData, packState, actor) => {
    if (!packState.useSuperiority) return attackData;
    
    const dieType = actor.system?.resources?.superiority?.die || "d8";
    const mods = attackData.atkMods || '';
    packState.usedInAttack = true; // Mark for damage
    
    return {
      ...attackData,
      atkMods: mods ? `${mods} + 1${dieType}` : `1${dieType}`
    };
  },
  
  modifyDamage: (damageData, packState, actor) => {
    if (!packState.useSuperiority && !packState.usedInAttack) return damageData;
    
    const dieType = actor.system?.resources?.superiority?.die || "d8";
    return {
      ...damageData,
      extraRows: [
        ...(damageData.extraRows || []),
        {
          id: 'superiority-die',
          formula: `1${dieType}`,
          type: 'kinetic',
          inCrit: true,
          label: 'Superiority Die'
        }
      ]
    };
  },
  
  consumeResources: async (packState, actor) => {
    if (!packState.useSuperiority && !packState.usedInAttack) return;
    
    const current = actor.system?.resources?.superiority?.value || 0;
    if (current > 0) {
      await actor.update({ "system.resources.superiority.value": current - 1 });
      
      const dieType = actor.system?.resources?.superiority?.die || "d8";
      ui.notifications.info(`Used superiority die (1${dieType}). ${current - 1} remaining.`);
    }
  }
});

console.log("SW5E Helper: Combat Superiority pack registered");