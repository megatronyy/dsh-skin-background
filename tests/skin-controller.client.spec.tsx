// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { FALLBACK_WALLPAPER_URL } from '../src/skin-settings.ts'
import {
  DESKTOP_CHROME_STYLE_TAG, SKIN_ACTIVE_CLASS, SKIN_STYLE_TAG, SKIN_BASE_TOKEN_OVERRIDES, SkinController, desktopChromeCss, windowTokenOverrides,
  type ThemeOverrideService,
} from '../src/client/SkinController.ts'

interface RecordedLayer {
  source: string
  tokens: Record<string, { light: string; dark: string }>
}

function createTheme(): { theme: ThemeOverrideService; layers: RecordedLayer[]; disposed: number } {
  const layers: RecordedLayer[] = []
  let disposed = 0
  const theme: ThemeOverrideService = {
    overrideTokens: (source, tokens) => {
      const layer = { source, tokens }
      layers.push(layer)
      return () => { disposed += 1 }
    },
  }
  return { theme, layers, get disposed() { return disposed } }
}

function controller(): { skin: SkinController; theme: ReturnType<typeof createTheme> } {
  const harness = createTheme()
  return { skin: new SkinController({ document, theme: harness.theme }), theme: harness }
}

const vars = (): Record<string, string> => {
  const style = document.documentElement.style
  const names = [
    '--dsh-skin-image', '--dsh-skin-dim-light', '--dsh-skin-dim-dark', '--dsh-skin-blur', '--dsh-skin-bleed',
    '--dsh-skin-window-light', '--dsh-skin-window-dark',
  ]
  return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name)]))
}

const styleTag = (): HTMLStyleElement | null =>
  document.querySelector(`style[data-plugin-css="${SKIN_STYLE_TAG}"]`)

const chromeTags = (): HTMLStyleElement[] =>
  [...document.querySelectorAll<HTMLStyleElement>(`style[data-plugin-css="${DESKTOP_CHROME_STYLE_TAG}"]`)]

const activeLayers = (theme: ReturnType<typeof createTheme>): RecordedLayer[] => theme.layers.slice(theme.disposed)

describe('SkinController', () => {
  it('applies the base token layer (canvas + sidebar) with the wallpaper by default', () => {
    const { skin, theme } = controller()
    skin.apply({ enabled: true, image: '', transparency: 0.6, blur: 6 })
    expect(styleTag()?.dataset.plugin).toBe('dsh-skin-background')
    expect(styleTag()?.textContent).toContain('body.dsh-skin-active::before')
    // The plugin-manager surface follows the shared window transparency via
    // dynamic variables instead of opaque statics.
    expect(styleTag()?.textContent).toContain('[data-plugin-panel]')
    expect(styleTag()?.textContent).toContain('--dsh-skin-window-dark')
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(true)
    expect(vars()['--dsh-skin-image']).toBe(`url("${FALLBACK_WALLPAPER_URL}")`)
    expect(vars()['--dsh-skin-dim-light']).toBe('rgba(255,255,255,0.4)')
    expect(vars()['--dsh-skin-dim-dark']).toBe('rgba(6,8,14,0.55)')
    expect(vars()['--dsh-skin-blur']).toBe('6px')
    expect(vars()['--dsh-skin-bleed']).toBe('6px')
    // The base layer (canvas + sidebar) is the skin's core visual and is
    // always on; the window layer is absent while the transparency is 0.
    expect(activeLayers(theme)).toHaveLength(1)
    expect(activeLayers(theme)[0].source).toBe('dsh-skin-background')
    expect(activeLayers(theme)[0].tokens).toEqual(SKIN_BASE_TOKEN_OVERRIDES)
    expect(theme.layers.some(layer => layer.source === 'dsh-skin-background:window')).toBe(false)
  })

  it('adds the window layer while windowTransparency > 0 and keeps the base layer', () => {
    const { skin, theme } = controller()
    skin.apply({ enabled: true, windowTransparency: 0.45 })
    expect(activeLayers(theme)).toHaveLength(2)
    const windowLayer = activeLayers(theme).find(layer => layer.source === 'dsh-skin-background:window')
    expect(windowLayer?.tokens).toEqual(windowTokenOverrides(0.45))
    // Re-applying with the layer on replaces both layers instead of stacking.
    skin.apply({ enabled: true, image: '', transparency: 0.8, blur: 0, windowTransparency: 0.45 })
    expect(theme.disposed).toBe(2)
    expect(activeLayers(theme)).toHaveLength(2)
    expect(vars()['--dsh-skin-dim-light']).toBe('rgba(255,255,255,0.2)')
    // Dropping the transparency to 0 removes the window layer; the base stays.
    skin.apply({ enabled: true, image: '', transparency: 0.8, blur: 0, windowTransparency: 0 })
    expect(theme.disposed).toBe(4)
    expect(activeLayers(theme)).toHaveLength(1)
    expect(activeLayers(theme)[0].source).toBe('dsh-skin-background')
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(true)
  })

  it('resolves preset references once the wallpaper list arrives', () => {
    const { skin } = controller()
    skin.apply({ enabled: true, image: 'preset:dusk-drift', transparency: 0.7, blur: 0 })
    expect(vars()['--dsh-skin-image']).toBe(`url("${FALLBACK_WALLPAPER_URL}")`)
    skin.applyWallpapers([
      { id: 'dusk-drift', name: 'dusk drift', url: '/skin-background/wallpapers/dusk-drift.svg', source: 'builtin' },
    ])
    expect(vars()['--dsh-skin-image']).toBe('url("/skin-background/wallpapers/dusk-drift.svg")')
  })

  it('passes valid http URLs through and repairs garbage settings', () => {
    const { skin } = controller()
    skin.apply({ enabled: true, image: 'https://cdn.example.com/w.jpg', transparency: 0, blur: -4 })
    expect(vars()['--dsh-skin-image']).toBe('url("https://cdn.example.com/w.jpg")')
    expect(vars()['--dsh-skin-dim-light']).toBe('rgba(255,255,255,1)')
    expect(vars()['--dsh-skin-blur']).toBe('0px')
    // A garbage enabled flag resolves to disabled, which deactivates the layer.
    skin.apply({ enabled: 'nope', image: 'javascript:alert(1)' })
    expect(vars()['--dsh-skin-image']).toBe('')
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(false)
  })

  it('deactivates on disable and fully reverts on dispose', () => {
    const { skin, theme } = controller()
    skin.apply({ enabled: true, windowTransparency: 0.4 })
    skin.apply({ enabled: false })
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(false)
    expect(vars()['--dsh-skin-image']).toBe('')
    expect(theme.disposed).toBe(2) // base + window layers both dropped
    expect(styleTag()).not.toBeNull() // plugin still loaded; style tag stays

    skin.apply({ enabled: true, windowTransparency: 0.4 })
    expect(activeLayers(theme)).toHaveLength(2)
    skin.dispose()
    expect(theme.disposed).toBe(4)
    expect(document.body.classList.contains(SKIN_ACTIVE_CLASS)).toBe(false)
    expect(styleTag()).toBeNull()
  })

  it('routes the desktop title bar and the caption probe through the skin variables', () => {
    const { skin } = controller()
    skin.apply({ enabled: true })
    const chrome = chromeTags()
    expect(chrome).toHaveLength(1)
    expect(chrome[0].dataset.plugin).toBe('dsh-skin-background')
    expect(chrome[0].textContent).toBe(desktopChromeCss())
    // The strip is re-pointed at the main panel's own fill instead of the
    // app's opaque-leaning sidebar fill.
    expect(chrome[0].textContent).toContain('div:has(> [data-rightbar-col]) { background: var(--dsh-skin-chrome-fill); }')
    // The drag handle paints that fill twice, so the strip stacks as many
    // translucent layers as the panel column beside it (see desktopChromeCss).
    expect(chrome[0].textContent).toContain('div:has(> [data-rightbar-col])::before { background-color: var(--dsh-skin-chrome-fill); background-image: linear-gradient(var(--dsh-skin-chrome-fill), var(--dsh-skin-chrome-fill)); }')
    // The caption probe the desktop preload measures drives the window buttons;
    // transparent hands the backdrop over to whatever the strip renders.
    expect(chrome[0].textContent).toContain('span[style*="--dsw-specific-sidebar-fill"] { --dsw-specific-sidebar-fill: var(--dsh-skin-caption-fill); }')
    // The session card's rounded top-left corner is squared off: with one shared
    // fill on both sides its notch reads as a lighter wedge.
    expect(chrome[0].textContent).toContain('[class*="_centerCol"] { border-top-left-radius: 0; }')
    // Defaults live in the skin sheet, so a settings change only has to move
    // the variables both layers resolve.
    expect(styleTag()?.textContent).toContain('--dsh-skin-chrome-fill: var(--dsw-alias-bg-base, rgba(17, 20, 28, 0.5))')
    expect(styleTag()?.textContent).toContain('--dsh-skin-caption-fill: transparent')
  })

  it('rewrites a single chrome tag per apply and drops it once the skin is off', () => {
    const { skin } = controller()
    skin.apply({ enabled: true, transparency: 0.4 })
    const first = chromeTags()[0]
    skin.apply({ enabled: true, transparency: 0.6 })
    // Same tag, rewritten: the desktop preload only re-measures its probe on
    // `<head>` mutations, so the text has to be written again, not skipped.
    expect(chromeTags()).toHaveLength(1)
    expect(chromeTags()[0]).toBe(first)
    expect(chromeTags()[0].isConnected).toBe(true)

    skin.apply({ enabled: false })
    expect(chromeTags()).toHaveLength(0)
    skin.apply({ enabled: true })
    expect(chromeTags()).toHaveLength(1)
    expect(chromeTags()[0]).not.toBe(first)
  })
})
