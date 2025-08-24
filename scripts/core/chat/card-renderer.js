// scripts/core/chat/card-renderer.js
// Condensed single-message attack card renderer
// - Uses <details><summary> per target
// - No DOM patching; always re-render from state
// - All state lives in message.flags["sw5e-helper"].state

export function renderAttackCard(state) {
  const DEBUG = true; // Should match api.js debug flag
  if (DEBUG) console.log("SW5E DEBUG: renderAttackCard() called", { state });
  
  const l = (k) => game.i18n.localize(k);
  const isGM = game.user?.isGM === true;
  const adv = (state?.attack?.advState && state.attack.advState !== "NONE") ? ` (${state.attack.advState})` : "";
  const saveOnly = !!state?.options?.saveOnly;
  const isManualDamage = !!state?.options?.manualDamage; // FIXED: Check for manual damage mode

  // Visibility logic for GM toolbar
  const gmHideRollAllDamage = (state.targets || []).every(t => {
    const eligible = saveOnly || isManualDamage || ["hit", "crit"].includes(String(t?.summary?.status || ""));
    if (!eligible || t.missing) return true;
    return t?.damage?.total != null;
  });
  const gmHideRollAllSaves = (state.targets || []).every(t => {
    if (!t?.save || t.missing) return true;
    return !!t.save?.roll; // save rolled → hide GM roll-all saves
  });

  // Header controls (icon-first) + GM toolbar + Expand/Collapse all
  const hdrActions = `
    <div class="card-damage-controls">
      ${gmHideRollAllDamage ? "" : `<a class="icon-btn" data-action="card-quick-damage" title="${l("SW5EHELPER.QuickDamage")}" aria-label="${l("SW5EHELPER.QuickDamage")}">⚡</a>`}
      ${gmHideRollAllDamage ? "" : `<a class="icon-btn" data-action="card-mod-damage"   title="${l("SW5EHELPER.ModDamage")}"   aria-label="${l("SW5EHELPER.ModDamage")}">🎲</a>`}
      ${isGM ? `
        <div class="gm-toolbar">
          ${(gmHideRollAllSaves || isManualDamage) ? "" : `<a class="mini-btn" data-action="gm-roll-all-saves">${l("SW5EHELPER.RollAllSaves")}</a>`}
          <a class="mini-btn" data-action="gm-apply-all-full">${l("SW5EHELPER.ApplyAllFull")}</a>
        </div>` : ""
      }
      <a class="mini-btn" data-action="toggle-all">${state.ui?.expandedAll ? l("SW5EHELPER.CollapseAll") : l("SW5EHELPER.ExpandAll")}</a>
    </div>
  `;

  // Build all target rows
  const rows = (state.targets || []).map((t, index) => {
    const ref = _refOf(t);
    const kept = Number.isFinite(t?.summary?.keptDie) ? ` (${t.summary.keptDie})` : "";
    const atk = Number.isFinite(t?.summary?.attackTotal) ? `${t.summary.attackTotal}${kept}` : "—";
    const status = String(t?.summary?.status || "pending");
    const statusClass = ({
      hit: "status-hit",
      miss: "status-miss",
      crit: "status-crit",
      fumble: "status-fumble",
      saveonly: "status-saveonly",
      "manual-damage": "status-manual-damage",
      pending: "status-pending"
    })[status] || "status-pending";

    const statusIcon = ({
      hit: "●",
      miss: "○", 
      crit: "◆",
      fumble: "○",
      saveonly: "🛡️",
      "manual-damage": "💥",
      pending: "●"
    })[status] || "●";

    const statusText = status === "manual-damage" ? "DAMAGE" : status.toUpperCase();
    
    if (DEBUG) console.log(`SW5E DEBUG: Processing target ${t.name}`, { 
      ref, 
      summary: t.summary, 
      status, 
      atk, 
      statusClass 
    });

    // Damage total for summary
    const dmgDisplay = t.damage?.total != null ? `💥 ${t.damage.total}` : 
                      (saveOnly || isManualDamage || ["hit", "crit"].includes(status)) ? "💥 --" : "—";
    
    // Summary actions on the right (apply buttons disappear once applied)
    const summaryActions = (!t.damage || t.damage?.applied)
      ? `${t.damage?.applied ? "✓" : ""} ${t.damage?.info ? `<span class="info-icon" data-action="show-damage-formula" data-target-ref="${ref}" title="${l("SW5EHELPER.DamageFormulaTooltip")}">ⓘ</span>` : ""}`
      : `
        <a class="icon-btn" data-action="apply-full" title="${l("SW5EHELPER.ApplyFull")}" aria-label="${l("SW5EHELPER.ApplyFull")}" data-target-ref="${ref}">💯</a>
        <a class="icon-btn" data-action="apply-half" title="${l("SW5EHELPER.ApplyHalf")}" aria-label="${l("SW5EHELPER.ApplyHalf")}" data-target-ref="${ref}">½</a>
        ${t.damage?.info ? `<span class="info-icon" data-action="show-damage-formula" data-target-ref="${ref}" title="${l("SW5EHELPER.DamageFormulaTooltip")}">ⓘ</span>` : ""}
      `;

    // Save line - only show if save checkboxes were checked in dialog AND not manual damage
    const saveLine = (state.hasSave && !isManualDamage)
      ? `
        <div class="save-line">
          <span>${(t.save?.ability?.toUpperCase?.() || t.save?.type || l("SW5EHELPER.Save"))} | DC: 
            <span class="save-dc" ${t.save?.formula ? `title="${t.save.formula}"` : ""}>${t.save?.dc ?? "—"}</span>
          </span>
          ${
            t.save?.roll
              ? `<span class="save-result">${t.save.roll.total} ${
                  t.save.roll.outcome === "success" ? "✅" :
                  t.save.roll.outcome === "fail"    ? "❌" :
                  t.save.roll.outcome === "critical"? "💥" :
                  t.save.roll.outcome === "fumble"  ? "💩" : ""
                }</span>`
              : `<a class="mini-btn" data-action="roll-save" data-target-ref="${ref}">${l("SW5EHELPER.RollSave")}</a>`
          }
        </div>`
      : "";

    // Damage line
    const appliedTag = t.damage?.applied
      ? `<span class="applied-tag">[${String(t.damage.applied).toUpperCase()}]</span>`
      : "";

    const dmgControls = t.damage?.applied
      ? ""
      : `
        <span class="icons">
          ${!isManualDamage ? `<a class="icon-btn" data-action="row-mod-damage" data-target-ref="${ref}" title="${l("SW5EHELPER.ModDamage")}" aria-label="${l("SW5EHELPER.ModDamage")}">🎲</a>` : ""}
          <a class="icon-btn" data-action="apply-full" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyFull")}" aria-label="${l("SW5EHELPER.ApplyFull")}">💯</a>
          <a class="icon-btn" data-action="apply-half" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyHalf")}" aria-label="${l("SW5EHELPER.ApplyHalf")}">½</a>
          <a class="icon-btn" data-action="apply-none" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyNone")}" aria-label="${l("SW5EHELPER.ApplyNone")}">Ø</a>
        </span>
      `;

    const dmgInfo = t.damage?.info
      ? `<span class="info-icon" data-action="show-damage-formula" data-target-ref="${ref}" title="${l("SW5EHELPER.DamageFormulaTooltip")}">ⓘ</span>`
      : "";

    const damageLine = `
      <div class="damage-line">
        <span>💥 ${l("SW5EHELPER.Damage")}:</span>
        <span class="dmg-val">${t.damage?.total ?? "—"}</span>
        ${appliedTag}
        ${dmgControls}
        ${dmgInfo}
      </div>
    `;

    const canControl = _userCanRow(t._actor) || game.user?.isGM;
    const nameAction = "ping-token";
    const pictureAction = canControl ? "select-token" : "ping-token";
    const alternatingClass = index % 2 === 0 ? " even" : " odd";

          console.log('SW5E HELPER canControl', t._actor, _userCanRow(t._actor), game.user?.isGM);

    return `
      <details class="target-row${t.missing ? " missing" : ""}${alternatingClass}" data-target-ref="${ref}" ${state.ui?.expandedAll ? "open" : ""}>
        <summary>
          <span class="expand-arrow">▶</span>
          <img class="portrait" src="${t.img}" data-action="${pictureAction}" data-target-ref="${ref}" />
          <span class="tname" data-action="${nameAction}" data-target-ref="${ref}">${t.name}</span>
          ${(saveOnly && !isManualDamage)
            ? `<span class="save-summary">
                ${t.save?.ability?.toUpperCase() || 'SAVE'} DC ${t.save?.dc ?? '—'}
                ${t.save?.roll ? ` | ${t.save.roll.total} ${
                  t.save.roll.outcome === "success" ? "✅" :
                  t.save.roll.outcome === "fail" ? "❌" :
                  t.save.roll.outcome === "critical" ? "💥" :
                  t.save.roll.outcome === "fumble" ? "💩" : ""
                }` : ''}
               </span>`
            : isManualDamage
            ? `<span class="damage-summary">${dmgDisplay}</span>`
            : `<span class="attack-total">${atk} <span class="status-icon ${statusClass}" title="${statusText}">${statusIcon}</span></span>
               <span class="damage-summary">${dmgDisplay}</span>`
          }
          <span class="row-actions">
            ${summaryActions}
            ${t.missing ? `<span class="missing">[${l("SW5EHELPER.Missing")}]</span>` : ""}
          </span>
        </summary>
        <div class="row-body">
          ${saveLine}
          ${damageLine}
        </div>
      </details>
    `;
  }).join("");

  // Header banner
  const attackInfoIcon = state.attack?.info
    ? `<span class="info-icon" data-action="show-attack-formula" title="${l("SW5EHELPER.AttackFormulaTooltip")}">ⓘ</span>`
    : "";

  // Header changes based on mode
  const weaponName = state.itemName || state.weaponName || "Unknown Weapon";
  const headerTitle = isManualDamage ? `${weaponName} - Manual Damage` :
                     saveOnly ? `${weaponName}` :
                     `${weaponName}`;

  if (DEBUG) console.log("SW5E DEBUG: Header title info", { 
    weaponName, 
    itemName: state.itemName, 
    weaponImg: state.weaponImg, 
    headerTitle,
    isManualDamage
  });

  const header = `
    <div class="weapon-banner">
      <img src="${state.weaponImg ?? ""}" alt="Weapon" class="weapon-icon" />
      <div class="weapon-title">
        <span class="name">${headerTitle}</span>
        ${attackInfoIcon}
      </div>
    </div>
    ${hdrActions}
  `;

  return `
    <div class="sw5e-helper-card" data-message-id="${state.messageId ?? ""}">
      ${header}
      <hr class="target-separator" />
      ${rows}
    </div>
  `;
}

/* -------------------------- local helpers -------------------------- */

function _refOf(t) {
  // sceneId:tokenId as unique row reference
  return `${t.sceneId}:${t.tokenId}`;
}

function _userCanRow(actorLike) {
  try {
    const a = actorLike ?? null;
    if (!a) return false;
    return game.user?.isGM || a?.isOwner === true || a?.ownership?.[game.userId] >= (CONST.DOCUMENT_PERMISSION_LEVELS?.OWNER ?? 3);
  } catch {
    return game.user?.isGM === true;
  }
}