import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKIN_SETTINGS, FALLBACK_WALLPAPER_URL, WALLPAPER_ROUTE,
  clampBlur, clampDim, isAcceptableImage, resolveImageUrl, resolveSkinSettings,
  type WallpaperEntry,
} from '../src/skin-settings.ts'

const wallpapers: WallpaperEntry[] = [
  { id: 'aurora-dawn', name: 'aurora dawn', url: `${WALLPAPER_ROUTE}/aurora-dawn.svg`, source: 'builtin' },
  { id: 'dusk-drift', name: 'dusk drift', url: `${WALLPAPER_ROUTE}/dusk-drift.svg`, source: 'builtin' },
]

describe('isAcceptableImage', () => {
  it('accepts empty, preset, http(s) URL, and plugin wallpaper paths', () => {
    expect(isAcceptableImage('')).toBe(true)
    expect(isAcceptableImage('preset:aurora-dawn')).toBe(true)
    expect(isAcceptableImage('preset:user-holiday')).toBe(true)
    expect(isAcceptableImage('https://example.com/a.jpg')).toBe(true)
    expect(isAcceptableImage('http://example.com/a.png')).toBe(true)
    expect(isAcceptableImage(`${WALLPAPER_ROUTE}/ocean-mist.svg`)).toBe(true)
    expect(isAcceptableImage(`${WALLPAPER_ROUTE}/my%20photo.PNG`)).toBe(true)
  })

  it('rejects dangerous and malformed references', () => {
    expect(isAcceptableImage('javascript:alert(1)')).toBe(false)
    expect(isAcceptableImage('data:image/png;base64,xxx')).toBe(false)
    expect(isAcceptableImage('file:///etc/passwd')).toBe(false)
    expect(isAcceptableImage('/etc/passwd.png')).toBe(false)
    expect(isAcceptableImage(`${WALLPAPER_ROUTE}/../secrets.json`)).toBe(false)
    expect(isAcceptableImage(`${WALLPAPER_ROUTE}/../../package.json`)).toBe(false)
    expect(isAcceptableImage(`${WALLPAPER_ROUTE}/no-extension`)).toBe(false)
    expect(isAcceptableImage('ftp://example.com/a.jpg')).toBe(false)
    expect(isAcceptableImage('preset:../evil')).toBe(false)
  })
})

describe('clamps', () => {
  it('clamps dim into [0, DIM_MAX] and maps garbage to the default', () => {
    expect(clampDim(-1)).toBe(0)
    expect(clampDim(2)).toBe(0.9)
    expect(clampDim(0.42)).toBe(0.42)
    expect(clampDim('x' as unknown)).toBe(DEFAULT_SKIN_SETTINGS.dim)
    expect(clampDim(undefined)).toBe(DEFAULT_SKIN_SETTINGS.dim)
  })

  it('clamps blur into [0, BLUR_MAX] whole pixels', () => {
    expect(clampBlur(-5)).toBe(0)
    expect(clampBlur(99)).toBe(24)
    expect(clampBlur(7.6)).toBe(8)
    expect(clampBlur(null)).toBe(DEFAULT_SKIN_SETTINGS.blur)
  })
})

describe('resolveSkinSettings', () => {
  it('fills defaults for an empty or garbage document', () => {
    expect(resolveSkinSettings(undefined)).toEqual(DEFAULT_SKIN_SETTINGS)
    expect(resolveSkinSettings(null)).toEqual(DEFAULT_SKIN_SETTINGS)
    expect(resolveSkinSettings('nope')).toEqual(DEFAULT_SKIN_SETTINGS)
  })

  it('keeps valid values and repairs invalid ones', () => {
    expect(resolveSkinSettings({ enabled: false, image: 'preset:x', dim: 0.5, blur: 3 }))
      .toEqual({ enabled: false, image: 'preset:x', dim: 0.5, blur: 3 })
    expect(resolveSkinSettings({ enabled: 'yes' as unknown, image: 'javascript:x', dim: 5, blur: -2 }))
      .toEqual({ enabled: false, image: '', dim: 0.9, blur: 0 })
  })
})

describe('resolveImageUrl', () => {
  it('resolves presets against the list and falls back for unknowns', () => {
    expect(resolveImageUrl('preset:dusk-drift', wallpapers)).toBe(`${WALLPAPER_ROUTE}/dusk-drift.svg`)
    expect(resolveImageUrl('preset:missing', wallpapers)).toBe(FALLBACK_WALLPAPER_URL)
    expect(resolveImageUrl('preset:anything', undefined)).toBe(FALLBACK_WALLPAPER_URL)
  })

  it('uses the shipped default for the empty reference and passes valid URLs through', () => {
    expect(resolveImageUrl('', wallpapers)).toBe(FALLBACK_WALLPAPER_URL)
    expect(resolveImageUrl('https://cdn.example.com/w.jpg', wallpapers)).toBe('https://cdn.example.com/w.jpg')
    expect(resolveImageUrl('javascript:alert(1)', wallpapers)).toBe(FALLBACK_WALLPAPER_URL)
  })
})
