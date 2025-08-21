/* sw5e-helper | save and damage roll helpers + apply stubs */
export async function rollSavesForTargets(state, targets) {
  const rolls = [];
  const results = [];
  for (const t of targets) {
    const formula = t.save?.formula || `1d20+${t.save?.mod ?? 0}`;
    const r = await (new Roll(formula)).evaluate({ async: true });
    game.dice3d?.showForRoll?.(r);
    rolls.push(r);
    const total = r.total ?? 0;
    const dc = t.save.dc;
    let outcome = total >= dc ? "success" : "fail";
    // Optional crit/fumble if your table uses 20/1 on d20
    const d20 = r.terms?.[0]?.results?.[0]?.result;
    if (d20 === 20) outcome = "critical";
    if (d20 === 1) outcome = "fumble";
    results.push({ roll: { total, formula: r.formula, info: r.formula, outcome } });
  }
  return { results, rolls };
}

/**
 * rollDamageForTargets
 * - separate=false: shared roll. mixed crits => base + critExtra once.
 * - separate=true : per-target roll using row crit status.
 * Returns per-target: { total, info, rollRef, types }
 */
export async function rollDamageForTargets(state, targets, { separate }) {
  const rolls = [];
  const results = [];
  const buildParts = (t, { crit=false, critExtraOnly=false }) => {
    const parts = (t.damage?.parts?.length ? t.damage.parts : state.damage?.parts) || [];
    // Map to {label, formula, type, includeInCrit}
    const norm = parts.map(p => ({
      label: p.label ?? p[2] ?? "",
      formula: p.formula ?? p[0],
      type: p.type ?? p[1] ?? "kinetic",
      includeInCrit: p.includeInCrit ?? true
    }));
    if (!crit) return norm;
    if (critExtraOnly) {
      // Only duplicate dice portions that are included in crit, no static mods.
      return norm
        .map(p => {
          const diceOnly = p.includeInCrit ? extractDiceOnly(p.formula) : "0";
          return { ...p, formula: diceOnly };
        });
    }
    // Full crit: the system usually doubles dice. Keep formula as-is and rely on Roll term multiplication if supported;
    // fallback: duplicate dice within formula string via extractDiceOnly + plus base.
    return norm.map(p => {
      if (!p.includeInCrit) return p;
      return { ...p, formula: doubleDiceInFormula(p.formula) };
    });
  };

  if (!separate) {
    const eligible = targets;
    const hasCrit = eligible.some(t => t.summary?.status === "crit");
    const hasHit  = eligible.some(t => t.summary?.status === "hit");
    const mixed = hasCrit && hasHit;

    // base roll
    const baseParts = buildParts(eligible[0], { crit: hasCrit && !mixed, critExtraOnly: false });
    const baseFormula = sumParts(baseParts);
    const baseRoll = await (new Roll(baseFormula)).evaluate({ async: true });
    game.dice3d?.showForRoll?.(baseRoll);
    rolls.push(baseRoll);
    const baseTypes = evalTypes(baseParts, baseRoll);

    let critExtraRoll = null;
    let critExtraTypes = null;
    if (mixed) {
      const extraParts = buildParts(eligible[0], { crit: true, critExtraOnly: true });
      const extraFormula = sumParts(extraParts);
      critExtraRoll = await (new Roll(extraFormula)).evaluate({ async: true });
      game.dice3d?.showForRoll?.(critExtraRoll);
      rolls.push(critExtraRoll);
      critExtraTypes = evalTypes(extraParts, critExtraRoll);
    }

    for (const t of eligible) {
      const isCrit = t.summary?.status === "crit";
      const total = isCrit && mixed ? (baseRoll.total + critExtraRoll.total)
                   : baseRoll.total;
      const types = isCrit && mixed ? addTypeMaps(baseTypes, critExtraTypes) : baseTypes;
      results.push({
        total,
        info: buildDamageInfo({ mixed, base: baseRoll, extra: critExtraRoll, parts: baseParts }),
        rollRef: `r:${(rolls.length - (critExtraRoll ? 2 : 1))}${critExtraRoll ? `+r:${rolls.length - 1}` : ""}`,
        types
      });
    }
    return { results, rolls };
  }

  // separate per target
  for (const t of targets) {
    const isCrit = t.summary?.status === "crit";
    const parts = buildParts(t, { crit: isCrit, critExtraOnly: false });
    const formula = sumParts(parts);
    const r = await (new Roll(formula)).evaluate({ async: true });
    game.dice3d?.showForRoll?.(r);
    rolls.push(r);
    const types = evalTypes(parts, r);
    results.push({
      total: r.total,
      info: buildDamageInfo({ mixed: false, base: r, parts }),
      rollRef: `r:${rolls.length - 1}`,
      types
    });
  }
  return { results, rolls };
}

export async function applyDamageToToken(state, target, amount, { mode }) {
  // Hooks placeholders for future resistances/reactions
  const pre = Hooks.call("sw5eHelper.preApplyDamage", { state, target, amount, mode, types: target.damage?.types });
  // No-op mitigation for now
  const appliedAmount = mode === "half" ? Math.floor(amount / 2) : mode === "none" ? 0 : amount;
  // Apply via SW5E damage workflow if desired later; for now, call core API:
  try {
    const token = canvas?.scene?.tokens.get(target.tokenId);
    await token?.actor?.applyDamage?.(appliedAmount); // if system supports
  } catch (e) {/* silent */}
  Hooks.callAll("sw5eHelper.postApplyDamage", { state, target, appliedAmount, mode, types: target.damage?.types });
  return { appliedAmount };
}

/* ---------- small helpers ---------- */
function sumParts(parts) {
  return parts.map(p => `(${p.formula})`).join(" + ") || "0";
}
function extractDiceOnly(formula) {
  // crude: keep NdX terms, drop + constants
  const m = formula.match(/(\d+d\d+(\s*[+-]\s*\d+d\d+)*)/i);
  return m ? m[0] : "0";
}
function doubleDiceInFormula(formula) {
  return formula.replace(/(\d+)d(\d+)/gi, (_, n, f) => `${Number(n) * 2}d${f}`);
}
function evalTypes(parts, roll) {
  // Split total by proportion of dice/static per part; here we map raw part totals if roll.terms align,
  // else fallback to equal split by number of parts (best effort).
  const map = {};
  const per = Math.floor((roll.total ?? 0) / Math.max(parts.length,1));
  for (const p of parts) map[p.type] = (map[p.type] || 0) + per;
 // Note: future improvement can parse roll terms per part.
  return map;
}
function addTypeMaps(a, b) {
  const out = { ...(a || {}) };
  for (const [k,v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}
function buildDamageInfo({ mixed, base, extra=null, parts }) {
  const partStr = parts.map(p => `${p.label ? p.label+":" : ""}${p.formula}`).join(" + ");
  return mixed
    ? `Base: ${base.formula} = ${base.total}  +  Crit Extra: ${extra.formula} = ${extra.total}  → total per-crit`
    : `${partStr} = ${base.total}`;
}
