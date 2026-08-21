# PR: Add dsh-skin-background

**PR title:** Add dsh-skin-background

**PR body (copy below this line)**

---

Adds `twfx7758/dsh-skin-background`, a theme/skin plugin for the dsh web client.

## What it does

- Selectable image background for the web UI: four original SVG gradient wallpapers ship with the package, users can drop their own images into `~/.dsh/skin-center/wallpapers`, or paste any http(s) image URL
- A "Skin" section in Settings (设置 → 皮肤): enable switch, wallpaper grid, custom URL field, dim (0–90%) and blur (0–24px) sliders — staged edits, revision-fenced saves, per-field reset to composed defaults
- Surfaces become translucent glass through the `ctx.theme.overrideTokens` layer; light/dark aware (a stronger dark veil keeps text contrast); disabling fully reverts every visual change
- Durable settings through the `skin-background` user-settings namespace with write validation (rejects `javascript:` and other unusable image references)

## Install

```
dsh plugin --profile web add github:twfx7758/dsh-skin-background
```

(or `dsh plugin --profile web add dsh-skin-background` from npm once published, preferred)

## Code

Dual-half dsh plugin (`src/index.ts` host + `src/client` browser, built to the lazy-CJS client-module factory format). 32 vitest specs (node + jsdom) cover the settings model, traversal-safe wallpaper serving, the route handlers, the skin controller lifecycle, and the settings section UI. Screenshots in `docs/screenshots/` are from the running web client.
