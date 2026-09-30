/**
 * Scoped stylesheet for the "Skin" settings section, transcribed from the
 * dsh-plugin-settings-ui skill template (prefix `cui-` → `skinbg-`, parts the
 * section does not use removed). Rules that carry over unchanged:
 *
 * - colors only via `--dsw-*` tokens, every var() with a hex fallback;
 * - scoped border-box (the host must not be assumed to set it globally);
 * - the numeric baseline (760px section, 34px inputs, 8/12px radii,
 *   11/12/13/15/18px type scale) comes from that template — keep it coherent.
 * Injected once with a fixed id so re-imports stay idempotent.
 */
export const SECTION_STYLE_ID = 'dsh-skin-background-section-styles'

export const SECTION_CSS = `
.skinbg-section, .skinbg-section *, .skinbg-section *::before, .skinbg-section *::after {
  box-sizing: border-box;
}
.skinbg-section {
  /* Brand blue pinned locally: dsh >= 0.1.7 redefines --dsw-alias-brand-primary
     to a neutral token (dark #0f1115 / light #f9fafb), so the alias cannot be
     trusted for blue accents. */
  --skinbg-brand: #4d6bfe;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
  color: var(--dsw-alias-label-primary, #f2f3f5);
}
.skinbg-section-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #f2f3f5);
}
.skinbg-section-intro {
  margin: 0 0 4px;
  max-width: 640px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-tertiary, #9ca1a9);
}
.skinbg-section :focus-visible {
  outline: 2px solid var(--skinbg-brand, #4d6bfe);
  outline-offset: 1px;
}

/* ---------- field blocks ---------- */
.skinbg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 0;
}
.skinbg-field + .skinbg-field {
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.11));
}
.skinbg-field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.skinbg-field-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, #f2f3f5);
}
.skinbg-field-label .skinbg-count {
  font-weight: 400;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary, #9ca1a9);
  margin-left: 8px;
}
.skinbg-field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--dsw-alias-label-tertiary, #9ca1a9);
}
.skinbg-field-invalid {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #f85149);
}

/* ---------- checkbox rows ---------- */
.skinbg-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, #f2f3f5);
  cursor: pointer;
}
.skinbg-check input {
  accent-color: var(--skinbg-brand, #4d6bfe);
  width: 15px;
  height: 15px;
  margin: 0;
}

/* ---------- wallpaper grid + upload tile ---------- */
.skinbg-wallpapers {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.skinbg-tile-wrap {
  position: relative;
  width: 132px;
  height: 78px;
  flex: none;
}
.skinbg-tile {
  appearance: none;
  font: inherit;
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.11));
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.14s, box-shadow 0.14s;
}
.skinbg-tile:hover {
  /* Brand-tinted hover: a plain gray read as a "silver selection edge". */
  border-color: rgba(77, 107, 254, 0.55);
}
.skinbg-tile[data-selected='true'] {
  border-color: var(--skinbg-brand, #4d6bfe);
  box-shadow: 0 0 0 3px var(--skinbg-brand, #4d6bfe);
}
.skinbg-tile-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 6px;
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
  color: var(--dsw-alias-label-primary, #f2f3f5);
  background: var(--dsw-alias-bg-overlay, rgba(20, 20, 22, 0.6));
}
.skinbg-tile-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--skinbg-brand, #4d6bfe);
  color: #ffffff;
}
/* User wallpapers: the delete button owns the top-right corner, so the
   selection badge mirrors to the top-left instead of hiding beneath it. */
.skinbg-tile-check-left {
  right: auto;
  left: 4px;
}
.skinbg-tile-check svg {
  width: 12px;
  height: 12px;
  display: block;
}
/* 删除按钮：常驻浅红底白垃圾桶，悬停加深为深红（不透明，不受壁纸照片干扰） */
.skinbg-tile-delete {
  appearance: none;
  font: inherit;
  cursor: pointer;
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2756b;
  color: #ffffff;
  transition: background 0.14s;
}
.skinbg-tile-delete:hover {
  background: #c5342a;
}
.skinbg-tile-delete svg {
  width: 13px;
  height: 13px;
  display: block;
}
.skinbg-add-tile {
  appearance: none;
  font: inherit;
  width: 132px;
  height: 78px;
  flex: none;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--dsw-alias-label-dimmed, #8a8f99);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #c9ccd0);
  cursor: pointer;
  transition: border-color 0.14s, background 0.14s, color 0.14s;
}
.skinbg-add-tile-plus {
  font-size: 22px;
  line-height: 1;
}
.skinbg-add-tile-label {
  font-size: 12px;
  line-height: 1.4;
}
.skinbg-add-tile:hover:not(:disabled) {
  border-color: var(--skinbg-brand, #4d6bfe);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-primary, #f2f3f5);
}
.skinbg-add-tile:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ---------- 精调按钮（滑杆两端的 − / +） ---------- */
.skinbg-step-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.skinbg-step-row .skinbg-range {
  flex: 1;
  min-width: 0;
}
.skinbg-step-btn {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 22px;
  height: 22px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary, #9ca1a9);
  background: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
.skinbg-step-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #f2f3f5);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
}
.skinbg-step-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ---------- inputs and buttons ---------- */
.skinbg-input {
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.11));
  background: var(--dsw-alias-bg-layer-3, #222227);
  height: 34px;
  font: inherit;
  color: var(--dsw-alias-label-primary, #f2f3f5);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
}
.skinbg-input:focus-visible {
  border-color: var(--skinbg-brand, #4d6bfe);
  background: var(--dsw-specific-input-major, #26262b);
  outline: none;
}
.skinbg-input.is-invalid {
  border-color: var(--dsw-alias-state-error-primary, #f85149);
}
.skinbg-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.skinbg-url-row .skinbg-input {
  flex: 1;
}
.skinbg-range {
  width: 100%;
  accent-color: var(--skinbg-brand, #4d6bfe);
}
.skinbg-btn {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.skinbg-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.skinbg-btn:focus-visible {
  outline: 2px solid var(--skinbg-brand, #4d6bfe);
  outline-offset: 2px;
}
.skinbg-btn-primary {
  background: var(--skinbg-brand, #4d6bfe);
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: background 0.14s, box-shadow 0.16s, transform 0.1s;
}
.skinbg-btn-primary:hover:not(:disabled) {
  background: #2f4fe0;
  box-shadow: 0 3px 10px rgba(77, 107, 254, 0.4);
  transform: translateY(-1px);
}
.skinbg-btn-primary:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.skinbg-spinner {
  width: 12px;
  height: 12px;
  flex: none;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: skinbg-spin 0.7s linear infinite;
}
@keyframes skinbg-spin {
  to { transform: rotate(360deg); }
}
.skinbg-btn-ghost {
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.11));
  color: var(--dsw-alias-label-secondary, #c9ccd0);
  background: transparent;
}
.skinbg-btn-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #f2f3f5);
  border-color: var(--dsw-alias-label-dimmed, #8a8f99);
}

/* ---------- pending badge + footer ---------- */
.skinbg-pending {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform, #2a2a30);
  color: var(--dsw-alias-label-secondary, #c9ccd0);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.skinbg-footer {
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.11));
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 0 4px;
}
.skinbg-footer-error {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #f85149);
}
.skinbg-saved-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-state-success-primary, #3fb950);
}
`
