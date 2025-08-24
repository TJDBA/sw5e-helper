// scripts/packs/force-empowered-strikes.js
// SW5E Helper - Force Empowered Strikes Feature Pack
// One feature, simple implementation

import { PackRegistry } from "./pack-registry.js";

PackRegistry.register({
  id: "force-empowered-strikes",
  name: "Force Empowered Strikes",
  
  // Just the feature ID - multiple classes can have this
  requiredFeatureIds: ["force-empowered-strikes"],
  
  available: (actor, weapon, context) => {
    const forcePoints = actor.system?.resources?.force?.value || 0;
    return forcePoints > 0;
  },
  
  // Only shows in damage dialog (adds damage, not attack bonus)
  renderDamageHTML: (actor, weapon, context) => {
    const forcePoints = actor.system?.resources?.force?.value || 0;
    const level = this.getFeatureLevel(actor, "force-empowered-strikes");
    const maxDice = Math.floor(level / 2) + 1; // Level-dependent limit
    const packState = context.packState?.['force-empowered-strikes'] || {};
    
    const availableDice = Math.min(maxDice, forcePoints);
    
    return `
      <div class="pack-feature">
        <label class="chk">
          <input type="checkbox" name="pack.force-empowered-strikes.useForceEmpowered" 
                 ${packState.useForceEmpowered ? 'checked' : ''}>
          Force Empowered Strikes
        </label>
        <select name="pack.force-empowered-strikes.diceCount" style="margin-left: 0.5rem;"
                ${!packState.useForceEmpowered ? 'disabled' : ''}>
          ${Array.from({length: availableDice}, (_, i) => {
            const count = i + 1;
            const selected = packState.diceCount == count ? 'selected' : '';
            return `<option value="${count}" ${selected}>${count}d8 force (${count} FP)</option>`;
          }).join('')}
        </select>
        <span class="note">Max ${maxDice} dice at your level</span>
      </div>
    `;
  },
  
  validateState: (packState, actor) => {
    if (!packState.useForceEmpowered) return true;
    
    const diceCount = Number(packState.diceCount) || 1;
    const forcePoints = actor.system?.resources?.force?.value || 0;
    const level = this.getFeatureLevel(actor, "force-empowered-strikes");
    const maxDice = Math.floor(level / 2) + 1;
    
    if (forcePoints < diceCount) {
      throw new Error(`Need ${diceCount} force points, only have ${forcePoints}`);
    }
    
    if (diceCount > maxDice) {
      throw new Error(`Can only use ${maxDice} dice at level ${level}`);
    }
    
    return true;
  },
  
  modifyDamage: (damageData, packState, actor) => {
    if (!packState.useForceEmpowered) return damageData;
    
    const diceCount = Number(packState.diceCount) || 1;
    return {
      ...damageData,
      extraRows: [
        ...(damageData.extraRows || []),
        {
          id: 'force-empowered',
          formula: `${diceCount}d8`,
          type: 'force',
          inCrit: true,
          label: 'Force Empowered'
        }
      ]
    };
  },
  
  consumeResources: async (packState, actor) => {
    if (!packState.useForceEmpowered) return;
    
    const diceCount = Number(packState.diceCount) || 1;
    const current = actor.system?.resources?.force?.value || 0;
    
    if (current >= diceCount) {
      await actor.update({ "system.resources.force.value": current - diceCount });
      ui.notifications.info(`Used ${diceCount} Force Point${diceCount > 1 ? 's' : ''}. ${current - diceCount} remaining.`);
    }
  },
  
  // Helper to get feature level from actor
  getFeatureLevel: (actor, featureId) => {
    // Look through actor items for the feature and get its level/details
    const feature = actor.items.find(item => 
      item.system?.identifier === featureId || 
      item.name.toLowerCase().includes('force empowered')
    );
    
    if (!feature) return 1; // Default level
    
    // Try to get level from feature, class, or actor level
    return feature.system?.level || 
           actor.items.find(i => i.type === 'class')?.system?.levels || 
           actor.system?.details?.level || 1;
  }
});

console.log("SW5E Helper: Force Empowered Strikes pack registered");