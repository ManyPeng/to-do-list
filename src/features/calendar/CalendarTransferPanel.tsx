import { useRef, useState } from 'react'
import type { CalendarImportItem } from '../../domain'
import { dataLayer } from '../../infrastructure/db/repositories'
import { CalendarTransferService, displayEventTime, type CalendarPreview } from '../../services/calendarTransferService'

const service = new CalendarTransferService(dataLayer)

function downloadIcs(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `daily-flow-calendar-${new Date().toISOString().slice(0, 10)}.ics`
  link.click()
  URL.revokeObjectURL(url)
}

export function CalendarTransferPanel() {
  const [preview, setPreview] = useState<CalendarPreview>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try { await action() } catch (error) {
      setMessage(error instanceof Error ? error.message : '日历文件操作失败')
    } finally { setBusy(false) }
  }

  const exportAll = () => run(async () => {
    const result = await service.exportTasks()
    downloadIcs(result.content)
    setMessage(`已导出 ${result.count} 个任务`)
  })

  const loadFile = (file: File) => run(async () => {
    setPreview(await service.preview(await file.text(), file.name))
    setMessage('日历文件已解析，请选择要导入的项目')
  })

  function toggle(importKey: string) {
    setPreview((current) => current ? {
      ...current,
      items: current.items.map((item) => item.importKey === importKey && !item.duplicate ? { ...item, selected: !item.selected } : item),
    } : current)
  }

  const importSelected = () => run(async () => {
    if (!preview) return
    const result = await service.importSelected(preview.items)
    setMessage(`已导入 ${result.imported} 项，跳过 ${result.skipped} 项`)
    setPreview(undefined)
    if (fileRef.current) fileRef.current.value = ''
  })

  return (
    <section className="calendar-transfer" aria-labelledby="calendar-transfer-title">
      <h2 id="calendar-transfer-title">日历互导</h2>
      <p>通过标准 ICS 文件与手机日历手动交换任务。文件仅在本地处理。</p>
      <div className="button-row">
        <button disabled={busy} onClick={() => void exportAll()}>导出全部任务</button>
        <button className="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>选择 ICS 文件</button>
        <input ref={fileRef} hidden type="file" accept="text/calendar,.ics" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void loadFile(file)
        }} />
      </div>
      {message && <p className="settings-message" role="status">{message}</p>}
      {preview && <div className="calendar-preview">
        <div className="calendar-preview-heading">
          <strong>导入预览</strong>
          <span>{preview.items.filter((item) => item.selected).length} 项已选择</span>
        </div>
        {preview.items.length === 0 && <p>没有可导入的日程项。</p>}
        {preview.items.map((item: CalendarImportItem) => (
          <label className={`calendar-item ${item.duplicate ? 'duplicate' : ''}`} key={item.importKey}>
            <input type="checkbox" checked={item.selected} disabled={item.duplicate} onChange={() => toggle(item.importKey)} />
            <span><strong>{item.event.title}</strong><small>{displayEventTime(item.event)}</small></span>
            {item.duplicate && <em>已导入，跳过</em>}
          </label>
        ))}
        {preview.errors.length > 0 && <div className="calendar-errors">
          <strong>无法导入的项目</strong>
          <ul>{preview.errors.map((error) => <li key={`${error.index}-${error.reason}`}>事件 {error.index || '未知'}：{error.reason}</li>)}</ul>
        </div>}
        <button disabled={busy || !preview.items.some((item) => item.selected)} onClick={() => void importSelected()}>导入所选项目</button>
      </div>}
    </section>
  )
}