/**
 * The "Skin" settings section: wallpaper picker (built-ins plus the user's
 * drop-in directory), custom image URL, enable switch, dim and blur sliders.
 * Edits are staged locally and written through the settings scope on save —
 * the scope fences each write with the revision it read, so a concurrent
 * change elsewhere refuses the save instead of being overwritten.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  BLUR_MAX, DIM_MAX, WALLPAPER_ROUTE, isAcceptableImage, resolveImageUrl, resolveSkinSettings,
  type SkinSettings, type WallpaperEntry,
} from '../skin-settings.ts'
import type { SkinDictionary } from './locales.ts'

/** Snapshot shape read from the bound settings scope. */
export interface SkinScopeSnapshot {
  value?: Partial<SkinSettings>
  /** Raw user layer; key presence (not value) marks a field overridden. */
  user?: Record<string, unknown>
  revision: number
}

/** The settings-scope surface this section needs (structural). */
export interface SkinScopeController {
  getSnapshot(): SkinScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** Fetch the wallpaper list from the plugin's Host route. */
export async function fetchWallpaperList(): Promise<WallpaperEntry[]> {
  const response = await fetch(WALLPAPER_ROUTE, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`wallpaper list request failed: ${response.status}`)
  const body = await response.json() as { wallpapers?: WallpaperEntry[] }
  return body.wallpapers ?? []
}

/**
 * Memoized wallpaper loader shared by the skin controller and the settings
 * section (one wire read per page); a failed read clears the memo so a later
 * open of the section retries.
 */
export function createWallpaperLoader(load: () => Promise<WallpaperEntry[]> = fetchWallpaperList): () => Promise<WallpaperEntry[]> {
  let memo: Promise<WallpaperEntry[]> | undefined
  return () => {
    memo ??= load().catch(error => {
      memo = undefined
      throw error
    })
    return memo
  }
}

type Draft = Partial<SkinSettings>
type Field = 'enabled' | 'image' | 'dim' | 'blur'
const FIELDS: readonly Field[] = ['enabled', 'image', 'dim', 'blur']

export interface SkinSectionProps {
  t: (key: keyof SkinDictionary) => string
  scope: SkinScopeController
  loadWallpapers?: () => Promise<WallpaperEntry[]>
}

/** One staged field differs from the composed value. */
function isDirty(draft: Draft, resolved: SkinSettings): boolean {
  return FIELDS.some(field => draft[field] !== undefined && draft[field] !== resolved[field])
}

export function SkinSection({ t, scope, loadWallpapers = fetchWallpaperList }: SkinSectionProps): JSX.Element {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const resolved = resolveSkinSettings(snapshot.value)

  const [draft, setDraft] = useState<Draft>({})
  const [wallpapers, setWallpapers] = useState<WallpaperEntry[] | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [urlText, setUrlText] = useState('')
  const [urlInvalid, setUrlInvalid] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    let cancelled = false
    loadWallpapers()
      .then(list => { if (!cancelled) setWallpapers(list) })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [loadWallpapers])

  // A revision the section did not write itself (another surface moved the
  // document) invalidates staged edits: show the composed truth again.
  useEffect(() => { setDraft({}) }, [snapshot.revision])

  const effective: SkinSettings = { ...resolved, ...draft }
  const dirty = isDirty(draft, resolved)
  const effectiveUrl = resolveImageUrl(effective.image, wallpapers)

  const stage = (patch: Draft): void => {
    setStatus('idle')
    setDraft(current => ({ ...current, ...patch }))
  }

  const applyUrl = (): void => {
    const text = urlText.trim()
    const acceptable = (text.startsWith('http://') || text.startsWith('https://') || text.startsWith(`${WALLPAPER_ROUTE}/`))
      && isAcceptableImage(text)
    if (!acceptable) {
      setUrlInvalid(true)
      return
    }
    setUrlInvalid(false)
    stage({ image: text })
  }

  const save = (): void => {
    const writes = FIELDS
      .filter(field => draft[field] !== undefined && draft[field] !== resolved[field])
      .map(field => scope.set(field, draft[field]))
    if (writes.length === 0) return
    void Promise.all(writes)
      .then(() => { setStatus('saved'); setDraft({}) })
      .catch(() => setStatus('failed'))
  }

  const resetField = (field: Field): void => {
    setStatus('idle')
    setDraft(current => { const next = { ...current }; delete next[field]; return next })
    void scope.unset(field).catch(() => setStatus('failed'))
  }

  const overridden = (field: Field): boolean => snapshot.user !== undefined && field in snapshot.user

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0', flexWrap: 'wrap',
  }
  const labelStyle: React.CSSProperties = { minWidth: 120, color: 'var(--dsw-alias-label-primary)' }
  const mutedStyle: React.CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }

  return (
    <section aria-label={t('title')}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--dsw-alias-label-primary)' }}>{t('title')}</h2>
      <p style={{ ...mutedStyle, marginTop: 0 }}>{t('intro')}</p>

      <div style={rowStyle}>
        <label style={{ ...labelStyle, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={effective.enabled}
            onChange={event => stage({ enabled: event.target.checked })}
            style={{ marginRight: 8 }}
          />
          {t('enabled')}
        </label>
        {overridden('enabled') && <ResetChip label={t('reset')} onClick={() => resetField('enabled')} />}
      </div>

      <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
        <span style={labelStyle}>{t('wallpaper')}</span>
        {wallpapers === undefined && <span style={mutedStyle}>{loadFailed ? t('loadFailed') : '…'}</span>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {wallpapers?.map(entry => {
            const selected = effectiveUrl === entry.url
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => stage({ image: `preset:${entry.id}` })}
                title={entry.source === 'user' ? `${entry.name} ${t('wallpaperUser')}` : entry.name}
                style={{
                  width: 132, height: 78, borderRadius: 8, cursor: 'pointer', position: 'relative',
                  border: selected ? '2px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l1)',
                  outline: 'none', padding: 0, overflow: 'hidden',
                  backgroundImage: `url("${entry.url}")`, backgroundSize: 'cover', backgroundPosition: 'center',
                }}
                aria-pressed={selected}
              >
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 6px',
                  fontSize: 11, color: 'var(--dsw-alias-label-primary)',
                  background: 'var(--dsw-alias-bg-overlay)', textAlign: 'left',
                }}>
                  {entry.name}{entry.source === 'user' ? t('wallpaperUser') : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {overridden('image') && <ResetChip label={t('reset')} onClick={() => resetField('image')} />}

      <div style={rowStyle}>
        <span style={labelStyle}>{t('customUrl')}</span>
        <Input
          style={{ flex: 1, minWidth: 260 }}
          placeholder="https://example.com/wallpaper.jpg"
          value={urlText}
          onChange={event => { setUrlText(event.target.value); setUrlInvalid(false) }}
          onKeyDown={event => { if (event.key === 'Enter') applyUrl() }}
        />
        <Button onClick={applyUrl}>{t('customUrlApply')}</Button>
        {urlInvalid && <span style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{t('customUrlInvalid')}</span>}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>{`${t('dim')} · ${Math.round(effective.dim * 100)}%`}</span>
        <input
          type="range" min={0} max={Math.round(DIM_MAX * 100)} step={5}
          value={Math.round(effective.dim * 100)}
          onChange={event => stage({ dim: Number(event.target.value) / 100 })
          }
          style={{ flex: 1, minWidth: 200 }}
        />
        {overridden('dim') && <ResetChip label={t('reset')} onClick={() => resetField('dim')} />}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>{`${t('blur')} · ${effective.blur}px`}</span>
        <input
          type="range" min={0} max={BLUR_MAX} step={1}
          value={effective.blur}
          onChange={event => stage({ blur: Number(event.target.value) })}
          style={{ flex: 1, minWidth: 200 }}
        />
        {overridden('blur') && <ResetChip label={t('reset')} onClick={() => resetField('blur')} />}
      </div>

      <div style={{ ...rowStyle, marginTop: 20 }}>
        <Button onClick={save}>{t('save')}</Button>
        <Button onClick={() => { setDraft({}); setStatus('idle') }}>{t('discard')}</Button>
        {dirty && <span style={mutedStyle}>{t('dirty')}</span>}
        {status === 'saved' && <span style={{ color: 'var(--dsw-alias-state-success-primary)', fontSize: 13 }}>{t('saved')}</span>}
        {status === 'failed' && <span style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{t('saveFailed')}</span>}
      </div>
    </section>
  )
}

/** Small "reset to composed default" affordance for one overridden field. */
function ResetChip({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 999, background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', fontSize: 12, padding: '2px 10px', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
