import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DailyCompletion, TemplateStreak } from '../../services/historyService'
import { HistoryService } from '../../services/historyService'
import { dataLayer } from '../../infrastructure/db/repositories'

const service = new HistoryService(dataLayer)
const sourceNames = { recurring: '固定任务', flexible: '灵活任务', calendar: '日历任务' }
const categoryNames = { personal: '自己的任务', family: '家人相关' }

function formatDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00`))
}

function formatTime(value?: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function HistoryPage() {
  const [days, setDays] = useState<DailyCompletion[]>([])
  const [streaks, setStreaks] = useState<TemplateStreak[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextDays, nextStreaks] = await Promise.all([
        service.listDailyCompletions(),
        service.listTemplateStreaks(),
      ])
      setDays(nextDays)
      setStreaks(nextStreaks)
      setSelectedDate((current) => current || nextDays[0]?.date || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取完成历史失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const selected = useMemo(
    () => days.find((day) => day.date === selectedDate),
    [days, selectedDate],
  )

  return (
    <section className="history-page">
      <header className="board-header">
        <div><p className="eyebrow">Daily Flow</p><h1>完成历史</h1><p>按完成日期回顾成果，连续统计只计算实际生成的应执行实例。</p></div>
        <button className="refresh-button" onClick={() => void load()} disabled={loading}>刷新</button>
      </header>

      {error && <p className="board-message error-message">{error}</p>}
      {loading ? <p className="board-message">正在读取完成记录…</p> : (
        <>
          <section className="streak-section" aria-labelledby="streak-title">
            <h2 id="streak-title">固定任务连续完成</h2>
            {streaks.length ? <div className="streak-grid">{streaks.map(({ template, current, longest }) => (
              <article className="streak-card" key={template.id}>
                <p>{template.status === 'archived' ? '已归档' : template.status === 'paused' ? '已暂停' : '进行中'}</p>
                <h3>{template.title}</h3>
                <dl><div><dt>当前连续</dt><dd>{current} 天</dd></div><div><dt>历史最长</dt><dd>{longest} 天</dd></div></dl>
              </article>
            ))}</div> : <p className="empty-column">还没有固定任务完成记录。</p>}
          </section>

          <section className="history-section" aria-labelledby="history-title">
            <div className="history-toolbar"><h2 id="history-title">按日期查看</h2><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></div>
            {!selected ? <p className="empty-column">该日期没有已完成任务。</p> : (
              <div className="history-day"><h3>{formatDate(selected.date)} <span>{selected.count} 项完成</span></h3><div className="history-task-list">{selected.tasks.map((task) => (
                <article className="history-task" key={task.id}><div><strong>{task.title}</strong><p>{categoryNames[task.category ?? 'personal']} · {sourceNames[task.source]} · 计划 {task.scheduledDate}</p></div><time dateTime={task.completedAt}>{formatTime(task.completedAt)}</time></article>
              ))}</div></div>
            )}
          </section>
        </>
      )}
    </section>
  )
}
