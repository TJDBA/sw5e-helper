// --- scripts/core/integrations/dicesonice.js ---

/**
 * Registers custom Dice So Nice! colorsets for SW5E damage types.
 * This ensures that damage rolls with types like [ion] or [kinetic] get custom colors.
 */
export function registerSw5eColorsets() {
  // First, check if Dice So Nice and its API are available.
  if (!game.dice3d?.api) {
    console.warn("SW5E Helper | Dice So Nice! API not found. Skipping colorset registration.");
    return;
  }

  // Define the SW5E damage types and their desired base colors.
  const sw5eDamageTypes = {
    kinetic: { name: 'Kinetic', color: '#8B4513', texture: 'stone', material: 'metal' },
    energy:  { name: 'Energy', color: '#FF4500', texture: 'fire' },
    ion:     { name: 'Ion', color: '#00BFFF', texture: 'ice', foreground: '#FFFFFF' },
    sonic:   { name: 'Sonic', color: '#FF69B4', texture: 'radial', foreground: '#FFFFFF' },
    true:    { name: 'True', color: '#FFFFFF', texture: 'stars', foreground: '#000000', outline: 'white' }
  };

  const dsn = game.dice3d.api;
  const existingSets = dsn.colorsets;

  console.log("SW5E Helper | Registering missing SW5E damage types with Dice So Nice!");

  for (const [key, config] of Object.entries(sw5eDamageTypes)) {
    // If a colorset with this name already exists, skip it. Don't overwrite user preferences.
    if (existingSets[key]) {
      console.log(`SW5E Helper | Colorset "${key}" already exists. Skipping.`);
      continue;
    }

    console.log(`SW5E Helper | Adding colorset for "${key}" damage.`);
    
    // Add the new colorset.
    dsn.addColorset({
      name: key,
      description: config.name,
      category: "SW5E Damage Types", // A custom category for organization.
      foreground: config.foreground || '#FFFFFF',
      background: config.color,
      outline: config.outline || 'black',
      edge: config.edge || config.color,
      texture: config.texture || 'none',
      material: config.material || 'plastic',
    });
  }
}