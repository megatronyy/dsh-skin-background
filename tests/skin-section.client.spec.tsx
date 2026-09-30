// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkinDictionary } from '../src/client/locales.ts'
import { SkinSection, type SkinScopeController, type SkinScopeSnapshot } from '../src/client/SkinSection.tsx'
import type { WallpaperEntry } from '../src/skin-settings.ts'

const t = (key: keyof SkinDictionary): string => key

const wallpapers: WallpaperEntry[] = [
  { id: 'aurora-dawn', name: 'aurora dawn', url: '/skin-background/wallpapers/aurora-dawn.svg', source: 'builtin' },
  { id: 'dusk-drift', name: 'dusk drift', url: '/skin-background/wallpapers/dusk-drift.svg', source: 'builtin' },
  { id: 'user-holiday', name: 'holiday', url: '/skin-background/wallpapers/holiday.jpg', source: 'user' },
]

class FakeScope implements SkinScopeController {
  private listeners = new Set<() => void>()
  private store: Record<string, unknown> = {}
  private snapshot: SkinScopeSnapshot
  readonly writes: { field: string; value: unknown }[] = []
  readonly unsets: string[] = []
  failNextWrite = false

  constructor(documents: Record<string, unknown>) {
    // Snapshots must be reference-stable between revisions — the same
    // contract the real config-form store keeps for useSyncExternalStore.
    this.snapshot = { status: 'ready', value: documents as never, user: {}, revision: 7 }
  }

  getSnapshot(): SkinScopeSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async set(field: string, value: unknown): Promise<boolean> {
    if (this.failNextWrite) { this.failNextWrite = false; return false }
    this.writes.push({ field, value })
    this.store[field] = value
    this.commit({ ...(this.snapshot.value as object), [field]: value } as never)
    return true
  }

  async unset(field: string): Promise<boolean> {
    this.unsets.push(field)
    delete this.store[field]
    this.commit()
    return true
  }

  /** Simulate the document moving (revision bump re-reads on the client). */
  commit(value?: Partial<Record<string, unknown>>): void {
    this.snapshot = {
      status: 'ready',
      value: (value ?? this.snapshot.value) as never,
      user: { ...this.store },
      revision: (this.snapshot.revision ?? 0) + 1,
    }
    for (const listener of this.listeners) listener()
  }
}

const mount = (scope: FakeScope): ReturnType<typeof render> =>
  render(<SkinSection t={t} scope={scope} loadWallpapers={() => Promise.resolve(wallpapers)} />)

afterEach(cleanup)

describe('SkinSection', () => {
  it('renders the controls with composed values and the wallpaper grid', async () => {
    const scope = new FakeScope({ enabled: true, image: 'preset:aurora-dawn', transparency: 0.35, blur: 0 })
    mount(scope)
    expect(screen.getByText('title')).toBeDefined()
    expect((screen.getByLabelText('enabled') as HTMLInputElement).checked).toBe(true)
    await waitFor(() => { expect(screen.getByTitle('dusk drift')).toBeDefined() })
    expect(screen.getByTitle('aurora dawn').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTitle('dusk drift').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/35%/)).toBeDefined()
  })

  it('marks the selected tile with data-selected and places the check badge by source', async () => {
    const scope = new FakeScope({ enabled: true, image: '/skin-background/wallpapers/holiday.jpg', transparency: 0.15, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('holiday wallpaperUser')).toBeDefined() })

    const userTile = screen.getByTitle('holiday wallpaperUser')
    expect(userTile.getAttribute('data-selected')).toBe('true')
    // User wallpapers: badge mirrors to the top-left so the delete button
    // keeps the top-right corner.
    expect(userTile.querySelector('.skinbg-tile-check-left')).not.toBeNull()
    // The delete button is a sibling inside the tile wrap.
    expect(userTile.closest('.skinbg-tile-wrap')?.querySelector('.skinbg-tile-delete')).not.toBeNull()

    const builtinTile = screen.getByTitle('aurora dawn')
    // false collapses to an absent attribute via `|| undefined`.
    expect(builtinTile.getAttribute('data-selected')).toBeNull()
    expect(builtinTile.querySelector('.skinbg-tile-check')).toBeNull()
  })

  it('stages a preset choice and writes it on save', async () => {
    const scope = new FakeScope({ enabled: true, image: 'preset:aurora-dawn', transparency: 0.35, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('dusk drift')).toBeDefined() })
    fireEvent.click(screen.getByTitle('dusk drift'))
    expect(screen.getByTitle('dusk drift').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('dirty')).toBeDefined()
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => { expect(scope.writes).toEqual([{ field: 'image', value: 'preset:dusk-drift' }]) })
    expect(screen.getByText('saved')).toBeDefined()
  })

  it('stages the enable switch, transparency, and blur writes', async () => {
    const scope = new FakeScope({ enabled: true, image: '', transparency: 0.3, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('aurora dawn')).toBeDefined() })
    fireEvent.click(screen.getByLabelText('enabled'))
    fireEvent.change(screen.getByLabelText(/^transparency · /), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText(/^blur · /), { target: { value: '8' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => {
      expect(scope.writes).toContainEqual({ field: 'enabled', value: false })
      expect(scope.writes).toContainEqual({ field: 'transparency', value: 0.6 })
      expect(scope.writes).toContainEqual({ field: 'blur', value: 8 })
    })
  })

  it('stages the window transparency slider and writes it on save', async () => {
    const scope = new FakeScope({ enabled: true, image: '', transparency: 0.15, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('aurora dawn')).toBeDefined() })
    expect((screen.getByLabelText(/^windowTransparency · /) as HTMLInputElement).value).toBe('0')
    fireEvent.change(screen.getByLabelText(/^windowTransparency · /), { target: { value: '40' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => { expect(scope.writes).toEqual([{ field: 'windowTransparency', value: 0.4 }]) })
  })

  it('accepts a valid custom URL and rejects a dangerous one', async () => {
    const scope = new FakeScope({ enabled: true, image: '', transparency: 0.35, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByPlaceholderText('https://example.com/wallpaper.jpg')).toBeDefined() })
    const input = screen.getByPlaceholderText('https://example.com/wallpaper.jpg')
    const applyButton = screen.getByText('customUrlApply')

    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(applyButton)
    expect(screen.getByText('customUrlInvalid')).toBeDefined()
    expect(scope.writes).toEqual([])

    fireEvent.change(input, { target: { value: 'https://cdn.example.com/w.jpg' } })
    fireEvent.click(applyButton)
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => { expect(scope.writes).toEqual([{ field: 'image', value: 'https://cdn.example.com/w.jpg' }]) })
  })

  it('discard drops staged edits and a refused save reports failure', async () => {
    const scope = new FakeScope({ enabled: true, image: '', transparency: 0.35, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('aurora dawn')).toBeDefined() })
    fireEvent.click(screen.getByTitle('dusk drift'))
    fireEvent.click(screen.getByText('discard'))
    expect(screen.queryByText('dirty')).toBeNull()
    expect(screen.getByTitle('aurora dawn').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTitle('dusk drift'))
    scope.failNextWrite = true
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => { expect(screen.getByText('saveFailed')).toBeDefined() })
  })

  it('clears stale drafts when the document revision moves elsewhere', async () => {
    const scope = new FakeScope({ enabled: true, image: '', transparency: 0.35, blur: 0 })
    mount(scope)
    await waitFor(() => { expect(screen.getByTitle('aurora dawn')).toBeDefined() })
    fireEvent.click(screen.getByTitle('dusk drift'))
    expect(screen.getByText('dirty')).toBeDefined()
    scope.commit() // another surface changed the document
    await waitFor(() => { expect(screen.queryByText('dirty')).toBeNull() })
  })

  it('deletes a user wallpaper from the grid and deselects it when in use', async () => {
    const deleteCalls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleteCalls.push(String(input))
        return new Response('{"ok":"true"}', { status: 200 })
      }
      return originalFetch(input, init)
    }) as typeof fetch
    try {
      const scope = new FakeScope({ enabled: true, image: '/skin-background/wallpapers/holiday.jpg', transparency: 0.3, blur: 0 })
      mount(scope)
      await waitFor(() => { expect(screen.getByTitle('holiday wallpaperUser')).toBeDefined() })
      fireEvent.click(screen.getByLabelText('deleteWallpaper: holiday'))
      await waitFor(() => { expect(deleteCalls).toEqual(['/skin-background/wallpapers/holiday.jpg']) })
      expect(screen.queryByTitle('holiday wallpaperUser')).toBeNull()
      // The deleted image was in use: saving writes the empty reference.
      fireEvent.click(screen.getByText('save'))
      await waitFor(() => { expect(scope.writes).toContainEqual({ field: 'image', value: '' }) })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
