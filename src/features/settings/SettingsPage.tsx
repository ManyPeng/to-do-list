import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Settings, Snapshot } from '../../domain'
import { dataLayer } from '../../infrastructure/db/repositories'
import { BackupService } from '../../services/backupService'
import { CalendarTransferPanel } from '../calendar/CalendarTransferPanel'

const backupService = new BackupService(dataLayer)

function downloadJson(value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `daily-flow-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [settings, setSettings] = useState<Settings>()
  const [message, setMessage] = useState('')
  const [reminder, setReminder] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [items, shouldRemind, currentSettings] = await Promise.all([
      backupService.listSnapshots(),
      backupService.shouldRemindExternalBackup(),
      backupService.getSettings(),
    ])
    setSnapshots(items)
    setReminder(shouldRemind)
    setSettings(currentSettings)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : '设置加载失败')
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      setMessage(success)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const createSnapshot = () => run(async () => {
    await backupService.createSnapshot('manual')
  }, '本地快照已创建')

  const exportBackup = () => run(async () => {
    downloadJson(await backupService.exportBackup())
  }, '备份文件已导出')

  async function importFile(file: File) {
    if (!window.confirm('导入会覆盖当前任务、模板和设置，是否继续？')) return
    await run(async () => backupService.restoreBackup(await file.text()), '备份已恢复，请刷新其他已打开页面')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function restoreSnapshot(snapshot: Snapshot) {
    if (!window.confirm(`将恢复 ${snapshot.snapshotDate} 的快照并覆盖当前数据，是否继续？`)) return
    await run(async () => backupService.restoreSnapshot(snapshot.id), '快照已恢复')
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) return
    await run(async () => {
      const updated = await backupService.updateSettings(settings)
      setSettings(updated)
    }, '工作节奏设置已保存')
  }

  function updateNumber(key: keyof Pick<Settings, 'wipLimit' | 'focusLimit' | 'snapshotRetentionCount' | 'externalBackupReminderDays'>, value: string) {
    setSettings((current) => current ? { ...current, [key]: Number(value) } : current)
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="page-header">
        <div><p className="eyebrow">Daily Flow</p><h1 id="settings-title">设置</h1><p>控制每天同时推进多少事项，以及本地数据的保护节奏。</p></div>
      </header>

      {reminder && (
        <aside className="backup-reminder">
          <strong>建议导出异地备份</strong>
          <span>本地快照会随浏览器网站数据一起被清除。</span>
          <div className="button-row">
            <button disabled={busy} onClick={exportBackup}>立即导出</button>
            <button className="secondary" disabled={busy} onClick={() => run(() => backupService.remindLater(), '明天再次提醒')}>稍后提醒</button>
          </div>
        </aside>
      )}

      {message && <p className="settings-message" role="status">{message}</p>}

      <section className="settings-card rhythm-settings" aria-labelledby="rhythm-settings-title">
        <div className="settings-card-heading">
          <div><p className="settings-kicker">工作节奏</p><h2 id="rhythm-settings-title">给注意力设一道边界</h2></div>
          <span>即时生效</span>
        </div>
        <p>限制进行中的任务和今日重点数量，避免看板重新变成一张无限清单。</p>
        {settings ? (
          <form className="settings-form" onSubmit={(event) => void saveSettings(event)}>
            <label>进行中任务上限<input required type="number" min="1" max="99" value={settings.wipLimit} onChange={(event) => updateNumber('wipLimit', event.target.value)} /></label>
            <label>今日重点上限<input required type="number" min="1" max="99" value={settings.focusLimit} onChange={(event) => updateNumber('focusLimit', event.target.value)} /></label>
            <label>自动快照保留数<input required type="number" min="1" max="365" value={settings.snapshotRetentionCount} onChange={(event) => updateNumber('snapshotRetentionCount', event.target.value)} /></label>
            <label>异地备份提醒周期（天）<input required type="number" min="1" max="365" value={settings.externalBackupReminderDays} onChange={(event) => updateNumber('externalBackupReminderDays', event.target.value)} /></label>
            <button type="submit" disabled={busy}>保存设置</button>
          </form>
        ) : <p>正在读取设置…</p>}
      </section>

      <div className="settings-actions">
        <article className="settings-card">
          <h2>完整备份</h2>
          <p>导出包含任务、模板、子任务和设置的版本化 JSON 文件。</p>
          <div className="button-row">
            <button disabled={busy} onClick={exportBackup}>导出 JSON</button>
            <button className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>导入 JSON</button>
            <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importFile(file)
            }} />
          </div>
        </article>

        <article className="settings-card">
          <h2>本地快照</h2>
          <p>应用每天自动创建一次，默认滚动保留最近 14 份。</p>
          <button disabled={busy} onClick={createSnapshot}>立即创建快照</button>
        </article>
      </div>

      <section className="snapshot-list" aria-labelledby="snapshot-title">
        <h2 id="snapshot-title">可恢复快照</h2>
        {snapshots.length === 0 ? <p>暂无快照。</p> : snapshots.map((snapshot) => (
          <article key={snapshot.id} className="snapshot-item">
            <div><strong>{snapshot.snapshotDate}</strong><span>{snapshot.source === 'auto' ? '自动' : '手动'} · {new Date(snapshot.createdAt).toLocaleString()}</span></div>
            <button className="secondary" disabled={busy} onClick={() => void restoreSnapshot(snapshot)}>恢复</button>
          </article>
        ))}
      </section>

      <CalendarTransferPanel />
    </section>
  )
}
