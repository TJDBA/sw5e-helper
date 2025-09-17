// scripts/core/chat/card-renderer.js
// Modern, clean attack card renderer with improved visual design
// - Uses modern card design with better spacing and typography
// - Enhanced visual hierarchy and status indicators
// - Improved interactive elements and hover states

export function renderAttackCard(state) {
  const DEBUG = true; // Should match api.js debug flag
  if (DEBUG) console.log("SW5E DEBUG: renderAttackCard() called", { state });
  
  const l = (k) => game.i18n.localize(k);
  const isGM = game.user?.isGM === true;
  const adv = (state?.attack?.advState && state.attack.advState !== "NONE") ? ` (${state.attack.advState})` : "";
  const saveOnly = !!state?.options?.saveOnly;
  const isManualDamage = !!state?.options?.manualDamage;

  // Visibility logic for GM toolbar
  const gmHideRollAllDamage = (state.targets || []).every(t => {
    const eligible = saveOnly || isManualDamage || ["hit", "crit"].includes(String(t?.summary?.status || ""));
    if (!eligible || t.missing) return true;
    return t?.damage?.total != null;
  });
  const gmHideRollAllSaves = (state.targets || []).every(t => {
    if (!t?.save || t.missing) return true;
    return !!t.save?.roll;
  });

  // Header controls with modern design
  const hdrActions = `
    <div class="card-controls">
      <div class="control-group">
        ${gmHideRollAllDamage ? "" : `
          <button class="control-btn primary" data-action="card-quick-damage" title="${l("SW5EHELPER.QuickDamage")}">
            ⚡ Quick Damage
          </button>
        `}
        ${gmHideRollAllDamage ? "" : `
          <button class="control-btn secondary" data-action="card-mod-damage" title="${l("SW5EHELPER.ModDamage")}">
            🎲 Modify Damage
          </button>
        `}
      </div>
      
      ${isGM ? `
        <div class="gm-controls">
          ${(gmHideRollAllSaves || isManualDamage) ? "" : `
            <button class="control-btn secondary" data-action="gm-roll-all-saves">
              🎲 Roll All Saves
            </button>
          `}
          <button class="control-btn primary" data-action="gm-apply-all-full">
            💯 Apply All Full
          </button>
        </div>
      ` : ""}
      
      <div class="view-controls">
        <button class="control-btn secondary" data-action="toggle-all">
          ${state.ui?.expandedAll ? '📁 Collapse All' : '📂 Expand All'}
        </button>
      </div>
    </div>
  `;

  // Build all target rows with modern design
  const rows = (state.targets || []).map((t, index) => {
    const ref = _refOf(t);
    const kept = Number.isFinite(t?.summary?.keptDie) ? ` (${t.summary.keptDie})` : "";
    const atk = Number.isFinite(t?.summary?.attackTotal) ? `${t.summary.attackTotal}${kept}` : "—";
    const status = String(t?.summary?.status || "pending");
    
    const statusConfig = {
      hit: { class: "status-hit", icon: "✅", text: "HIT", color: "#28a745" },
      miss: { class: "status-miss", icon: "❌", text: "MISS", color: "#dc3545" },
      crit: { class: "status-crit", icon: "💥", text: "CRITICAL", color: "#ffc107" },
      fumble: { class: "status-fumble", icon: "💩", text: "FUMBLE", color: "#6f42c1" },
      saveonly: { class: "status-saveonly", icon: "🛡️", text: "SAVE", color: "#17a2b8" },
      "manual-damage": { class: "status-manual-damage", icon: "💥", text: "DAMAGE", color: "#fd7e14" },
      pending: { class: "status-pending", icon: "⏳", text: "PENDING", color: "#6c757d" }
    };
    
    const statusInfo = statusConfig[status] || statusConfig.pending;
    
    if (DEBUG) console.log(`SW5E DEBUG: Processing target ${t.name}`, { 
      ref, 
      summary: t.summary, 
      status, 
      atk, 
      statusInfo 
    });

    // Damage total for summary
    const dmgDisplay = t.damage?.total != null ? `💥 ${t.damage.total}` : 
                      (saveOnly || isManualDamage || ["hit", "crit"].includes(status)) ? "💥 --" : "—";
    
    // Summary actions on the right
    const summaryActions = (!t.damage || t.damage?.applied)
      ? `
        <div class="status-indicator">
          ${t.damage?.applied ? `<span class="applied-badge">✓ Applied</span>` : ""}
          ${t.damage?.info ? `
            <button class="info-btn" data-action="show-damage-formula" data-target-ref="${ref}" title="${l("SW5EHELPER.DamageFormulaTooltip")}">
              ⓘ
            </button>
          ` : ""}
        </div>
      `
      : `
        <div class="action-buttons">
          <button class="action-btn primary" data-action="apply-full" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyFull")}">
            💯 Full
          </button>
          <button class="action-btn secondary" data-action="apply-half" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyHalf")}">
            ½ Half
          </button>
          ${t.damage?.info ? `
            <button class="info-btn" data-action="show-damage-formula" data-target-ref="${ref}" title="${l("SW5EHELPER.DamageFormulaTooltip")}">
              ⓘ
            </button>
          ` : ""}
        </div>
      `;

    // Save line with modern styling
    const saveLine = (state.hasSave && !isManualDamage)
      ? `
        <div class="save-section">
          <div class="save-header">
            <span class="save-type">${(t.save?.ability?.toUpperCase?.() || t.save?.type || l("SW5EHELPER.Save"))}</span>
            <span class="save-dc">
              DC: <span class="dc-value" ${t.save?.formula ? `title="${t.save.formula}"` : ""}>${t.save?.dc ?? "—"}</span>
            </span>
          </div>
          <div class="save-actions">
            ${
              t.save?.roll
                ? `
                  <div class="save-result ${t.save.roll.outcome}">
                    <span class="roll-total">${t.save.roll.total}</span>
                    <span class="roll-outcome">
                      ${t.save.roll.outcome === "success" ? "✅ Success" :
                        t.save.roll.outcome === "fail" ? "❌ Fail" :
                        t.save.roll.outcome === "critical" ? "💥 Critical Success" :
                        t.save.roll.outcome === "fumble" ? "💩 Critical Fail" : ""}
                    </span>
                  </div>
                `
                : `
                  <button class="save-btn primary" data-action="roll-save" data-target-ref="${ref}">
                    🎲 ${l("SW5EHELPER.RollSave")}
                  </button>
                `
            }
          </div>
        </div>`
      : "";

    // Damage line with modern styling
    const appliedTag = t.damage?.applied
      ? `<span class="applied-tag ${t.damage.applied}">[${String(t.damage.applied).toUpperCase()}]</span>`
      : "";

    const dmgControls = t.damage?.applied
      ? ""
      : `
        <div class="damage-actions">
          ${!isManualDamage ? `
            <button class="action-btn secondary" data-action="row-mod-damage" data-target-ref="${ref}" title="${l("SW5EHELPER.ModDamage")}">
              🎲 Modify
            </button>
          ` : ""}
          <button class="action-btn primary" data-action="apply-full" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyFull")}">
            💯 Full
          </button>
          <button class="action-btn secondary" data-action="apply-half" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyHalf")}">
            ½ Half
          </button>
          <button class="action-btn warn" data-action="apply-none" data-target-ref="${ref}" title="${l("SW5EHELPER.ApplyNone")}">
            Ø None
          </button>
        </div>
      `;

    const damageLine = `
      <div class="damage-section">
        <div class="damage-header">
          <span class="damage-label">💥 ${l("SW5EHELPER.Damage")}</span>
          <span class="damage-total">${t.damage?.total ?? "—"}</span>
          ${appliedTag}
        </div>
        ${dmgControls}
      </div>`;

    const canControl = _userCanRow(t._actor) || game.user?.isGM;
    const nameAction = "ping-token";
    const pictureAction = canControl ? "select-token" : "ping-token";
    const alternatingClass = index % 2 === 0 ? " even" : " odd";

    if (DEBUG) console.log('SW5E HELPER canControl', t._actor, _userCanRow(t._actor), game.user?.isGM);

    return `
      <div class="target-card${t.missing ? " missing" : ""}${alternatingClass}" data-target-ref="${ref}">
        <div class="target-header" ${state.ui?.expandedAll ? "data-expanded='true'" : ""}>
          <div class="target-info">
            <img class="target-portrait" src="${t.img}" data-action="${pictureAction}" data-target-ref="${ref}" />
            <div class="target-details">
              <span class="target-name" data-action="${nameAction}" data-target-ref="${ref}">${t.name}</span>
              ${(saveOnly && !isManualDamage)
                ? `<div class="save-summary">
                    ${t.save?.ability?.toUpperCase() || 'SAVE'} DC ${t.save?.dc ?? '—'}
                    ${t.save?.roll ? ` | ${t.save.roll.total} ${
                      t.save.roll.outcome === "success" ? "✅" :
                      t.save.roll.outcome === "fail" ? "❌" :
                      t.save.roll.outcome === "critical" ? "💥" :
                      t.save.roll.outcome === "fumble" ? "💩" : ""}
                    ` : ''}
                   </div>`
                : isManualDamage
                ? `<div class="damage-summary">${dmgDisplay}</div>`
                : `
                   <div class="attack-summary">
                     <span class="attack-roll">${atk}</span>
                     <span class="status-badge ${statusInfo.class}" style="background-color: ${statusInfo.color}20; color: ${statusInfo.color}; border-color: ${statusInfo.color}">
                       ${statusInfo.icon} ${statusInfo.text}
                     </span>
                   </div>
                   <div class="damage-summary">${dmgDisplay}</div>
                 `
              }
            </div>
          </div>
          
          <div class="target-actions">
            ${summaryActions}
            ${t.missing ? `<span class="missing-badge">[${l("SW5EHELPER.Missing")}]</span>` : ""}
          </div>
        </div>
        
        <div class="target-content" ${state.ui?.expandedAll ? "style='display: block;'" : ""}>
          ${saveLine}
          ${damageLine}
        </div>
      </div>
    `;
  }).join("");

  // Header banner with modern design
  const attackInfoIcon = state.attack?.info
    ? `<button class="info-btn header" data-action="show-attack-formula" title="${l("SW5EHELPER.AttackFormulaTooltip")}">ⓘ</button>`
    : "";

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
    <div class="card-header">
      <div class="weapon-info">
        <img src="${state.weaponImg ?? ""}" alt="Weapon" class="weapon-icon" />
        <div class="weapon-details">
          <h3 class="weapon-title">${headerTitle}</h3>
          ${attackInfoIcon}
        </div>
      </div>
    </div>
    ${hdrActions}
  `;

  return `
    <div class="sw5e-helper-card modern" data-message-id="${state.messageId ?? ""}">
      ${header}
      <div class="targets-container">
        ${rows}
      </div>
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
    
    if (a == null) return false;
    
    return game.user?.isGM || a?.isOwner === true || a?.ownership?.[game.userId] >= (CONST.DOCUMENT_PERMISSION_LEVELS?.OWNER ?? 3);
  } catch {
    return game.user?.isGM === true;
  }
}