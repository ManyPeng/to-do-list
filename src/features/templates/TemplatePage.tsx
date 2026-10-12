import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Priority, RepeatRule, TaskCategory, TaskTemplate, TaskTemplateInput, Weekday } from '../../domain'
import { todayLocalDate } from '../../domain'
import { dataLayer } from '../../infrastructure/db/repositories'
import { TaskTemplateService } from '../../services/taskTemplateService'

const service = new TaskTemplateService(dataLayer)
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const priorityLabels: Record<Priority, string> = { high: '高', medium: '中', low: '低' }
const statusLabels = { active: '启用中', paused: '已暂停', archived: '已归档' }
const categoryLabels: Record<TaskCategory, string> = { personal: '自己的任务', family: '家人相关' }

function ruleLabel(rule: RepeatRule) {
  if (rule.type === 'daily') return '每天'
  return `每周 ${rule.weekdays.map((day) => `周${weekdayLabels[day]}`).join('、')}`
}

export function TemplatePage() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [editing, setEditing] = useState<TaskTemplate>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await service.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '模板加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function run(operation: () => Promise<unknown>) {
    setBusy(true)
    setError(undefined)
    try {
      await operation()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请重试')
      throw caught
    } finally {
      setBusy(false)
    }
  }

  async function save(input: TaskTemplateInput) {
    try {
      if (editing) await run(() => service.update(editing.id, input, todayLocalDate()))
      else await run(() => service.create(input, todayLocalDate()))
      setEditorOpen(false)
    } catch { /* 错误已显示 */ }
  }

  async function changeStatus(template: TaskTemplate, status: 'active' | 'paused' | 'archived') {
    if (status === 'archived' && !window.confirm(`归档“${template.title}”后将不再生成新任务，是否继续？`)) return
    try { await run(() => service.setStatus(template.id, status, todayLocalDate())) } catch { /* 错误已显示 */ }
  }

  return (
    <section className="template-page" aria-labelledby="template-page-title">
      <header className="board-header">
        <div><p className="eyebrow">Daily Flow</p><h1 id="template-page-title">固定任务</h1><p>模板定义重复计划；每天生成的任务实例独立保存，修改模板不会改变历史。</p></div>
        <button type="button" className="primary-button" onClick={() => { setEditing(undefined); setEditorOpen(true) }}>新建模板</button>
      </header>
      {error && <div className="board-message error-message" role="alert">{error}</div>}
      {loading ? <div className="board-message">正在加载模板…</div> : (
        <div className="template-list">
          {templates.map((template) => (
            <article key={template.id} className={`template-card template-${template.status}`}>
              <div className="template-card-heading">
                <div><span className="template-status">{statusLabels[template.status]}</span><h2>{template.title}</h2></div>
                <span>{ruleLabel(template.repeatRule)}</span>
              </div>
              {template.description && <p>{template.description}</p>}
              <div className="task-meta"><span className={`template-category category-${template.category ?? 'personal'}`}>{categoryLabels[template.category ?? 'personal']}</span><span>{template.estimatedMinutes} 分钟</span><span>{priorityLabels[template.defaultPriority]}优先级</span>{template.startTime && <span>{template.startTime}</span>}</div>
              <div className="task-actions">
                {template.status !== 'archived' && <button type="button" disabled={busy} onClick={() => { setEditing(template); setEditorOpen(true) }}>编辑模板</button>}
                {template.status === 'active' && <button type="button" disabled={busy} onClick={() => void changeStatus(template, 'paused')}>暂停</button>}
                {template.status === 'paused' && <button type="button" disabled={busy} onClick={() => void changeStatus(template, 'active')}>恢复</button>}
                {template.status !== 'archived' && <button type="button" disabled={busy} onClick={() => void changeStatus(template, 'archived')}>归档</button>}
              </div>
            </article>
          ))}
          {!templates.length && <div className="board-message">还没有固定任务模板。创建一个，让任务按计划自动出现。</div>}
        </div>
      )}
      {editorOpen && <TemplateEditor key={editing?.id ?? 'new-template'} template={editing} busy={busy} onClose={() => setEditorOpen(false)} onSave={save} />}
    </section>
  )
}

function TemplateEditor({ template, busy, onClose, onSave }: {
  template?: TaskTemplate
  busy: boolean
  onClose: () => void
  onSave: (input: TaskTemplateInput) => Promise<void>
}) {
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState<TaskCategory>(template?.category ?? 'personal')
  const [ruleType, setRuleType] = useState<'daily' | 'weekly'>(template?.repeatRule.type ?? 'daily')
  const [weekdays, setWeekdays] = useState<Weekday[]>(template?.repeatRule.type === 'weekly' ? template.repeatRule.weekdays : [])
  const [minutes, setMinutes] = useState(template?.estimatedMinutes.toString() ?? '20')
  const [priority, setPriority] = useState<Priority>(template?.defaultPriority ?? 'medium')
  const [startTime, setStartTime] = useState(template?.startTime ?? '')

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSave({
      title,
      description: description.trim() || undefined,
      category,
      repeatRule: ruleType === 'daily' ? { type: 'daily' } : { type: 'weekly', weekdays },
      estimatedMinutes: Number(minutes),
      defaultPriority: priority,
      startTime: startTime || undefined,
    })
  }

  function toggleWeekday(day: Weekday) {
    setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort())
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="template-editor-title">
        <header className="drawer-header"><h2 id="template-editor-title">{template ? '编辑固定任务模板' : '新建固定任务模板'}</h2><button type="button" onClick={onClose}>关闭</button></header>
        <form className="task-form" onSubmit={(event) => void submit(event)}>
          <label>标题<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>描述<textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <fieldset className="category-fieldset">
            <legend>任务归属</legend>
            <div className="category-options">
              <label className={category === 'personal' ? 'active' : ''}><input type="radio" name="template-category" value="personal" checked={category === 'personal'} onChange={() => setCategory('personal')} />自己的任务</label>
              <label className={category === 'family' ? 'active family' : ''}><input type="radio" name="template-category" value="family" checked={category === 'family'} onChange={() => setCategory('family')} />家人相关</label>
            </div>
          </fieldset>
          <fieldset className="repeat-fieldset">
            <legend>重复规则</legend>
            <div className="repeat-options">
              <label><input type="radio" name="repeat" checked={ruleType === 'daily'} onChange={() => setRuleType('daily')} />每天</label>
              <label><input type="radio" name="repeat" checked={ruleType === 'weekly'} onChange={() => setRuleType('weekly')} />按星期</label>
            </div>
            {ruleType === 'weekly' && <div className="weekday-picker">{weekdayLabels.map((label, day) => <button key={label} type="button" className={weekdays.includes(day as Weekday) ? 'active' : ''} aria-pressed={weekdays.includes(day as Weekday)} onClick={() => toggleWeekday(day as Weekday)}>周{label}</button>)}</div>}
          </fieldset>
          <div className="form-row">
            <label>预计时长（分钟）<input required type="number" min="1" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
            <label>默认优先级<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
          </div>
          <label>默认开始时间<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          {ruleType === 'weekly' && weekdays.length === 0 && <p className="form-hint error-text">请至少选择一个星期。</p>}
          <button className="primary-button" type="submit" disabled={busy || (ruleType === 'weekly' && weekdays.length === 0)}>保存模板</button>
        </form>
      </aside>
    </div>
  )
}
