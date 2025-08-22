// scripts/core/engine/damage.js
import { getWeaponById } from "../adapter/sw5e.js";

// scripts/core/engine/damage.js
const MOD = "sw5e-helper";

const signed = n => `${n >= 0 ? "+" : ""}${n}`;

// Feature flip: allow ability mod to damage on off-hand attacks
const ALLOW_OFFHAND_DAMAGE_MOD = false;

/* ----------------------------- helpers ----------------------------- */

function deriveDefaultAbility(item) {
  const sys = item.system ?? {};
  if (sys.ability) return sys.ability;
  const type = sys.actionType || sys.activation?.type;
  const ranged = type?.startsWith?.("r");
  const finesse = sys.properties?.fin || sys.properties?.finesse;
  return (ranged || finesse) ? "dex" : "str";
}

// SW5E Brutal is stored as a short property flag `system.properties.bru`
function getBrutal(item) {
  const p = item.system?.properties ?? {};
  if (typeof p.bru === "number") return p.bru;
  if (p.bru === true) return 1;
  return 0;
}

const DIE_RE = /(\d+)d(\d+)(?:\s*min\s*(\d+))?/gi; // NdF [minY]

// Double only dice, preserve any existing min
function doubleDice(formula) {
  return String(formula || "").replace(DIE_RE, (_, n, f, min) => {
    const N = Number(n) * 2;
    return `${N}d${f}${min ? `min${min}` : ""}`;
  });
}

// Per-face minimums table
const MIN_BY_FACES = { 4: 2, 6: 2, 8: 3, 10: 4, 12: 5, 20: 8 };

// Apply per-face minimums, preserving the higher of existing vs table
function applyMinByFaces(formula) {
  return String(formula || "").replace(DIE_RE, (_, n, f, min) => {
    const faces = Number(f);
    const wanted = MIN_BY_FACES[faces];
    if (!wanted) return `${n}d${f}${min ? `min${min}` : ""}`;
    const eff = Math.max(Number(min ?? 0), wanted);
    return `${n}d${f}min${eff}`;
  });
}

// Find first NdF in a formula to determine faces for Brutal
function firstDieFaces(formula) {
  const m = [...String(formula || "").matchAll(DIE_RE)][0];
  return m ? Number(m[2]) : null;
}

// Build weapon damage formulas (array of strings) and whether they use @mod
function weaponParts(item) {
  const parts = (item.system?.damage?.parts || []).map(([f]) => String(f));
  const usesAtMod = parts.some(f => /@mod\b/.test(f));
  return { parts, usesAtMod };
}

// Split extra rows into crit-eligible and ineligible pools
function splitExtraRows(rows) {
  const eligible = [], ineligible = [];
  for (const r of rows || []) (r.inCrit ? eligible : ineligible).push(r);
  return { eligible, ineligible };
}

/* ----------------------------- engine ------------------------------ */

export async function rollDamage({ actor, weaponId, state }) {
  const item = getWeaponById(actor.actor, weaponId);
  if (!item) return ui.notifications.warn("No weapon selected.");

  // Resolve damage ability mod (Smart overrides)
  const abilityKey = state.ability || deriveDefaultAbility(item);
  let dmgMod = state.smart ? Number(state.smartAbility ?? 0)
                           : (actor.abilities?.[abilityKey]?.mod ?? 0);

  // Off-hand rule: disable positive mod to damage (unless feature flips the flag)
  if (state.offhand && !ALLOW_OFFHAND_DAMAGE_MOD) {
    if (dmgMod > 0) dmgMod = 0;
  }

  // Weapon parts and whether they use @mod
  const { parts: baseParts, usesAtMod } = weaponParts(item);
  const baseData = actor.actor.getRollData?.() ?? {};
  const rollData = { ...baseData };
  if (usesAtMod) rollData.mod = dmgMod;

  // Build the weapon block
  let weaponBlock = baseParts.join(" + ") || "";

  // Apply crit doubling on weapon dice
  if (state.crit && weaponBlock) weaponBlock = doubleDice(weaponBlock);

  // Brutal dice added AFTER doubling, using faces from first weapon die
  const bru = getBrutal(item);
  if (state.crit && bru > 0 && weaponBlock) {
    const faces = firstDieFaces(weaponBlock);
    if (faces) weaponBlock = `${weaponBlock} + ${bru}d${faces}`;
  }

  // Extra rows
  const { eligible: rowsElig, ineligible: rowsInelig } = splitExtraRows(state.extraRows);

  // Eligible extras (subject to crit/min)
  let extraElig = rowsElig.map(r => r.formula).filter(Boolean).join(" + ");
  if (state.crit && extraElig) extraElig = doubleDice(extraElig);

  // Apply min-die per-face thresholds to the eligible pool if toggled
  if (state.useMinDie) {
    if (weaponBlock) weaponBlock = applyMinByFaces(weaponBlock);
    if (extraElig)   extraElig   = applyMinByFaces(extraElig);
  }

  // Ineligible extras (never crit-doubled or min-floored)
  const extraInelig = rowsInelig.map(r => r.formula).filter(Boolean).join(" + ");

  // If weapon doesn't use @mod, add the flat ability mod to the ineligible pool
  let ineligiblePool = extraInelig;
  if (!usesAtMod && dmgMod) {
    ineligiblePool = ineligiblePool ? `${ineligiblePool} + ${signed(dmgMod)}` : signed(dmgMod);
  }

  // Eligible pool = weapon + eligible extras
  const eligiblePool = [weaponBlock, extraElig].filter(Boolean).join(" + ");

  // Once-per-turn damage advantage/disadvantage (eligible pool only)
  const wantAdv = !!state.otpDamageAdv;
  const wantDis = !!state.otpDamageDis;
  const applyOtp = !state.separate && (wantAdv || wantDis);

  // Targets & roller
  const targets = Array.from(game.user?.targets ?? []);
  const R = Roll;

  // roll helpers
  const rollOnce = async (formula) => {
    if (!formula || !formula.trim()) return null;
    const r = new R(formula, rollData);
    if (typeof r.evaluate === "function") await r.evaluate({ async: true });
    else if (typeof r.roll === "function") await r.roll({ async: true });
    return r;
  };

  const rollEligiblePool = async () => {
    if (!eligiblePool) return { total: 0, roll: null, detail: "" };
    if (!applyOtp) {
      const r = await rollOnce(eligiblePool);
      return { total: r?.total ?? 0, roll: r, detail: "" };
    }
    // Roll eligible pool twice and keep high/low total
    const r1 = await rollOnce(eligiblePool);
    const r2 = await rollOnce(eligiblePool);
    const pickHigh = wantAdv && !wantDis;
    const chosen = pickHigh
      ? ((r1?.total ?? 0) >= (r2?.total ?? 0) ? r1 : r2)
      : ((r1?.total ?? 0) <= (r2?.total ?? 0) ? r1 : r2);
    const detail = ` (${pickHigh ? "keep highest" : "keep lowest"} of ${r1?.total ?? 0}, ${r2?.total ?? 0})`;
    return { total: chosen?.total ?? 0, roll: chosen, detail };
  };

  const rollIneligiblePool = async () => {
    if (!ineligiblePool) return { total: 0, roll: null };
    const r = await rollOnce(ineligiblePool);
    return { total: r?.total ?? 0, roll: r };
  };

  /* ---------------------------- build message ---------------------------- */

  const lines = [];
  const rolls = [];

  const doOneTarget = async (t) => {
    const elig = await rollEligiblePool(); if (elig.roll) rolls.push(elig.roll);
    const ine  = await rollIneligiblePool(); if (ine.roll) rolls.push(ine.roll);
    const total = (elig.total || 0) + (ine.total || 0);
    lines.push(
      `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${total}</b>${state.crit ? " (CRIT)" : ""}${elig.detail || ""}</li>`
    );
  };

  if (state.separate && targets.length > 1) {
    for (const t of targets) await doOneTarget(t);
  } else {
    // Shared roll → compute once, show for each target
    const elig = await rollEligiblePool(); if (elig.roll) rolls.push(elig.roll);
    const ine  = await rollIneligiblePool(); if (ine.roll)  rolls.push(ine.roll);
    const total = (elig.total || 0) + (ine.total || 0);

    if (targets.length) {
      for (const t of targets) {
        lines.push(
          `<li><a class="sw5e-helper-target" data-scene="${canvas.scene?.id}" data-token="${t.id}">${t.name}</a>: <b>${total}</b>${state.crit ? " (CRIT)" : ""}${elig.detail || ""}</li>`
        );
      }
    } else {
      lines.push(`<li><b>${total}</b>${state.crit ? " (CRIT)" : ""}${elig.detail || ""}</li>`);
    }
  }

  // Breakdown (compact)
  const header = `${item.name} — Damage${state.crit ? " · CRIT" : ""}`;
  const pieces = [];
  if (baseParts.length) pieces.push(`weapon: ${baseParts.join(" + ")}`);
  if (state.crit) {
    pieces.push(`crit: doubled weapon dice${bru ? `; brutal +${bru}d?` : ""}`);
  }
  if (state.useMinDie) pieces.push(`min die thresholds on crit-eligible dice`);
  if (usesAtMod) pieces.push(`@mod=${signed(dmgMod)}`); else if (dmgMod) pieces.push(`mod: ${signed(dmgMod)}`);
  if (state.extraRows?.length) {
    const list = state.extraRows
      .map(r => `${r.formula}${r.inCrit ? " (crit-eligible)" : ""}${r.type ? ` [${r.type}]` : ""}`)
      .join("; ");
    pieces.push(`extra: ${list}`);
  }
  const breakdown = pieces.length ? `<div><small>${pieces.join(" · ")}</small></div>` : "";

  // Display formula reflecting adv/dis on eligible pool
  let eligibleDisplay = eligiblePool;
  if (applyOtp && eligiblePool) {
    const wrap = (s) => (s.includes("+") || s.includes(" ")) ? `(${s})` : s;
    const w = wrap(eligiblePool);
    eligibleDisplay = wantAdv ? `max(${w}, ${w})` : `min(${w}, ${w})`;
  }
  const displayFormula = [eligibleDisplay, ineligiblePool].filter(Boolean).join("  +  ");
  const list = `<ul style="margin:.5em 1em;">${lines.join("")}</ul>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor.actor }),
    flavor: `${header}${breakdown}<code>${displayFormula || "—"}</code>${list}`,
    type: (CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5),
    rolls
  });
}
  export async function quickDamageFromState({ actor, item, state }) {
    const opt = state?.options ?? {};
    const separate = !!opt.separate;
    const saveOnly = !!opt.saveOnly;

    // base weapon formulas and whether they use @mod
    const { parts: baseParts, usesAtMod } = weaponParts(item);
    let base = baseParts.join(" + ") || "0";

    // ability mod (smart override or chosen/default ability)
    const abilityKey = opt.ability || item?.system?.ability || deriveDefaultAbility(item);
    let abilityMod = opt.smart ? Number(opt.smartAbility ?? 0)
                              : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);

    // off-hand rule: no positive mod unless feature flag flips it
    if (opt.offhand && !ALLOW_OFFHAND_DAMAGE_MOD && abilityMod > 0) abilityMod = 0;

    // crit prep: doubling weapon dice only; Brutal after doubling
    const bru = getBrutal(item);
    const makeFormula = (isCrit) => {
      let f = isCrit ? doubleDice(base) : base;
      if (isCrit && bru > 0 && f) {
        const faces = firstDieFaces(f);
        if (faces) f = `${f} + ${bru}d${faces}`;
      }
      if (!usesAtMod && abilityMod) f = `${f} + ${signed(abilityMod)}`;
      return f;
    };

    // roll helper
    const doRoll = async (formula) => {
      if (!formula || !formula.trim()) return { total: 0, roll: null };
      const data = usesAtMod ? { mod: abilityMod } : {};
      const r = new Roll(formula, data);
      await r.evaluate({ async: true });
      try { await game.dice3d?.showForRoll?.(r, game.user, true); } catch (_) {}
      return { total: r.total ?? 0, roll: r };
    };

    const perTargetTotals = new Map();
    const rolls = [];

    // Save-only: treat all eligible as normal hits
    if (saveOnly) {
      if (separate) {
        for (const t of state.targets ?? []) {
          const { total, roll } = await doRoll(makeFormula(false));
          if (roll) rolls.push(roll);
          perTargetTotals.set(`${t.sceneId}:${t.tokenId}`, total);
        }
      } else {
        const { total, roll } = await doRoll(makeFormula(false));
        if (roll) rolls.push(roll);
        for (const t of state.targets ?? []) perTargetTotals.set(`${t.sceneId}:${t.tokenId}`, total);
      }
      return { perTargetTotals, rolls, breakdown: `${base} + ability(${abilityMod})` };
    }

    // With attack outcomes
    if (separate) {
      for (const t of state.targets ?? []) {
        const s = t.attack?.status;
        if (!s || s === "miss" || s === "fumble") continue;
        const isCrit = s === "crit";
        const { total, roll } = await doRoll(makeFormula(isCrit));
        if (roll) rolls.push(roll);
        perTargetTotals.set(`${t.sceneId}:${t.tokenId}`, total);
      }
    } else {
      const critRefs = [], hitRefs = [];
      for (const t of state.targets ?? []) {
        const s = t.attack?.status;
        if (!s || s === "miss" || s === "fumble") continue;
        (s === "crit" ? critRefs : hitRefs).push(`${t.sceneId}:${t.tokenId}`);
      }
      if (critRefs.length) {
        const { total, roll } = await doRoll(makeFormula(true));
        if (roll) rolls.push(roll);
        for (const ref of critRefs) perTargetTotals.set(ref, total);
      }
      if (hitRefs.length) {
        const { total, roll } = await doRoll(makeFormula(false));
        if (roll) rolls.push(roll);
        for (const ref of hitRefs) perTargetTotals.set(ref, total);
      }
    }

    return { perTargetTotals, rolls, breakdown: `${base} + ability(${abilityMod})` };
  }

  // Roll damage for a set of target refs using a dialog state
  export async function rollDamageForTargets({ actor, item, dmgState, targetRefs = [], critMap = {} }) {
    console.log("SW5E DEBUG: rollDamageForTargets ENTRY", { 
      weaponName: item?.name, 
      dmgState, 
      targetRefs, 
      critMap 
    });

    const { parts: baseParts, usesAtMod } = weaponParts(item);
    const base = baseParts.join(" + ") || "0";
    const brutalVal = Number(item?.system?.properties?.brutal ?? 0) || 0;
    const faces = firstDieFaces(base); // your helper

    console.log("SW5E DEBUG: Weapon damage formula", { base, usesAtMod, brutalVal, faces });

    // ability mod (smart or chosen) with off-hand rule
    const abilityKey = dmgState.ability || item?.system?.ability || deriveDefaultAbility(item);
    let abilityMod = dmgState.smart ? Number(dmgState.smartAbility ?? 0)
                                    : Number(foundry.utils.getProperty(actor, `system.abilities.${abilityKey}.mod`) ?? 0);
    if (dmgState.offhand && abilityMod > 0) abilityMod = 0;

    const extras = Array.isArray(dmgState.extraRows) ? dmgState.extraRows : [];

    const makeFormula = (isCrit) => {
      let f = isCrit ? doubleDice(base) : base;
      if (isCrit && brutalVal > 0 && faces) f = `${f} + ${brutalVal}d${faces}`;
      if (!usesAtMod && abilityMod) f = `${f} + ${signed(abilityMod)}`;
      for (const r of extras) {
        if (!r?.formula) continue;
        const chunk = (isCrit && r.inCrit) ? doubleDice(r.formula) : r.formula;
        f = `${f} + (${chunk})`;
      }
      return f;
    };

    const doRoll = async (isCrit, rollContext = "") => {
      const formula = makeFormula(isCrit);
      const data = usesAtMod ? { mod: abilityMod } : {};
      console.log(`SW5E DEBUG: doRoll(${isCrit}) ${rollContext}`, { formula, data });
      
      const roll = await (new Roll(formula, data)).evaluate({ async: true });
      console.log(`SW5E DEBUG: Roll result ${rollContext}`, { total: roll.total, formula: roll.formula });
      
      try { await game.dice3d?.showForRoll?.(roll, game.user, true); } catch (_) {}
      return roll;
    };

    const perTargetTotals = new Map();
    const rolls = [];
    
    let info = "";
    const perTargetTypes = new Map();

    if (!targetRefs.length) {
      // Manual, no targets selected: single roll using global crit toggle
      const r = await doRoll(!!dmgState.crit, "- manual no targets");
      rolls.push(r);
      return { perTargetTotals, rolls, singleTotal: r.total ?? 0 };
    }

    if (dmgState.separate) {
      // roll once per target (manual separate or card separate)
      console.log("SW5E DEBUG: Separate rolls mode");
      for (const ref of targetRefs) {
        const r = await doRoll(!!critMap[ref], `- separate for ${ref}`);
        rolls.push(r);
        perTargetTotals.set(ref, r.total ?? 0);
      }
    } else {
        // shared roll:
        // - If all hits are crits or all are non-crits → one roll applied to all
        // - If mixed crit + non-crit → roll BASE once (non-crit) + roll CRIT-EXTRA once, apply extra only to crit rows
        const critRefs = targetRefs.filter(ref => !!critMap[ref]);
        const hitRefs  = targetRefs.filter(ref => !critMap[ref]);

        if (!critRefs.length || !hitRefs.length) {
          // Uniform case: one roll applied to all eligible
          const isCrit = !!critRefs.length;
          console.log("SW5E DEBUG: Uniform case - all same type", { isCrit, critRefs: critRefs.length, hitRefs: hitRefs.length });
          const r = await doRoll(isCrit, "- uniform case"); 
          rolls.push(r);
          for (const ref of targetRefs) perTargetTotals.set(ref, r.total ?? 0);
          // crude type map: attribute total to "kinetic" bucket for now (placeholder for future per-part eval)
          for (const ref of targetRefs) perTargetTypes.set(ref, { kinetic: r.total ?? 0 });
          info = `${makeFormula(isCrit)} = ${r.total ?? 0}`;
        } else {
          // Mixed case: base(non-crit) + crit extra(only duplicated dice + brutal)
          // Build a crit-extra-only formula by duplicating only the dice-bearing pieces
          const diceOnly = (s) => (s.match(/(?:^|[+(-])\\s*\\d+d\\d+(?:\\s*[+*-]\\s*\\d+d\\d+)*/gi)?.join(" + ") || "0");
          console.log("SW5E DEBUG: Mixed case - some crits, some hits", { critRefs, hitRefs });
          
          const baseRoll = await doRoll(false, "- mixed case base");
          rolls.push(baseRoll);

          // crit-extra: duplicate only dice from base + eligible extras + add brutal dice
          let critExtra = diceOnly(base);
          for (const r of extras) {
            if (!r?.formula || !r.inCrit) continue;
            const d = diceOnly(r.formula);
            if (d && d !== "0") critExtra = critExtra ? `${critExtra} + ${d}` : d;
          }
          if (brutalVal > 0 && faces) critExtra = critExtra ? `${critExtra} + ${brutalVal}d${faces}` : `${brutalVal}d${faces}`;

          console.log("SW5E DEBUG: Crit extra formula", { critExtra });
          const extraRoll = await (new Roll(critExtra || "0")).evaluate({ async: true });
          console.log("SW5E DEBUG: Crit extra roll", { total: extraRoll.total });
          try { await game.dice3d?.showForRoll?.(extraRoll, game.user, true); } catch (_) {}
          rolls.push(extraRoll);

          // Apply totals
          for (const ref of hitRefs) {
            const total = (baseRoll.total ?? 0);
            perTargetTotals.set(ref, total);
            perTargetTypes.set(ref, { kinetic: total }); // placeholder type map
          }
          for (const ref of critRefs) {
            const total = (baseRoll.total ?? 0) + (extraRoll.total ?? 0);
            perTargetTotals.set(ref, total);
            perTargetTypes.set(ref, { kinetic: total }); // placeholder type map
          }
          info = `Base: ${baseFormula} = ${baseRoll.total ?? 0}  +  Crit Extra: ${critExtra || 0} = ${extraRoll.total ?? 0}`;
        }
    }

    return { perTargetTotals, perTargetTypes, rolls, info: info || `${base} + ability(${abilityMod})` };
  }
