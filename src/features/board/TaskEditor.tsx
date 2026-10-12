import { useState, type FormEvent } from 'react'
import type { Priority, Subtask, Task, TaskCategory, TaskInput } from '../../domain'

export type TaskEditorProps = {
  date: string
  task?: Task
  subtasks: Subtask[]
  busy: boolean
  onClose: () => void
  onSave: (input: TaskInput) => Promise<void>
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
  onAddSubtask: (title: string) => Promise<void>
  onUpdateSubtask: (subtask: Subtask, title: string, completed: boolean) => Promise<void>
  onDeleteSubtask: (subtask: Subtask) => Promise<void>
  onMoveSubtask: (subtask: Subtask, direction: -1 | 1) => Promise<void>
}

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

export function TaskEditor({
  date,
  task,
  subtasks,
  busy,
  onClose,
  onSave,
  onArchive,
  onDelete,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
  onMoveSubtask,
}: TaskEditorProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [category, setCategory] = useState<TaskCategory>(task?.category ?? 'personal')
  const [scheduledDate, setScheduledDate] = useState(task?.scheduledDate ?? date)
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [estimatedMinutes, setEstimatedMinutes] = useState(task?.estimatedMinutes?.toString() ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [newSubtask, setNewSubtask] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSave({
      title,
      description: optionalText(description),
      category,
      scheduledDate,
      priority,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      dueDate: dueDate || undefined,
      isFocused: task?.isFocused ?? false,
    })
  }

  async function addSubtask(event: FormEvent) {
    event.preventDefault()
    if (!newSubtask.trim()) return
    await onAddSubtask(newSubtask)
    setNewSubtask('')
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header className="drawer-header">
          <h2 id="editor-title">{task ? '编辑任务' : '新建灵活任务'}</h2>
          <button type="button" onClick={onClose} aria-label="关闭编辑抽屉">关闭</button>
        </header>

        <form className="task-form" onSubmit={(event) => void submit(event)}>
          <label>标题
            <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>计划日期
            <input required type="date" min={task ? undefined : date} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
          </label>
          <label>描述
            <textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <fieldset className="category-fieldset">
            <legend>任务归属</legend>
            <div className="category-options">
              <label className={category === 'personal' ? 'active' : ''}><input type="radio" name="task-category" value="personal" checked={category === 'personal'} onChange={() => setCategory('personal')} />自己的任务</label>
              <label className={category === 'family' ? 'active family' : ''}><input type="radio" name="task-category" value="family" checked={category === 'family'} onChange={() => setCategory('family')} />家人相关</label>
            </div>
          </fieldset>
          <div className="form-row">
            <label>优先级
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <label>预计时长（分钟）
              <input type="number" min="1" step="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} />
            </label>
          </div>
          <label>截止日期
            <input type="date" min={scheduledDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>保存任务</button>
        </form>

        {task && (
          <section className="subtask-editor" aria-labelledby="subtask-title">
            <div className="subtask-heading">
              <h3 id="subtask-title">子任务</h3>
              <span>{subtasks.filter((item) => item.completed).length}/{subtasks.length}</span>
            </div>
            <form className="subtask-add" onSubmit={(event) => void addSubtask(event)}>
              <input aria-label="新子任务标题" placeholder="添加子任务" value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} />
              <button type="submit" disabled={busy || !newSubtask.trim()}>添加</button>
            </form>
            <div className="subtask-list">
              {subtasks.map((subtask, index) => (
                <SubtaskRow
                  key={subtask.id}
                  subtask={subtask}
                  first={index === 0}
                  last={index === subtasks.length - 1}
                  busy={busy}
                  onUpdate={onUpdateSubtask}
                  onDelete={onDeleteSubtask}
                  onMove={onMoveSubtask}
                />
              ))}
              {!subtasks.length && <p>暂无子任务</p>}
            </div>
          </section>
        )}

        {task?.source === 'flexible' && (
          <footer className="drawer-danger-actions">
            <button type="button" disabled={busy} onClick={() => void onArchive()}>归档</button>
            <button type="button" className="danger-button" disabled={busy} onClick={() => void onDelete()}>删除</button>
          </footer>
        )}
      </aside>
    </div>
  )
}

function SubtaskRow({
  subtask,
  first,
  last,
  busy,
  onUpdate,
  onDelete,
  onMove,
}: {
  subtask: Subtask
  first: boolean
  last: boolean
  busy: boolean
  onUpdate: TaskEditorProps['onUpdateSubtask']
  onDelete: TaskEditorProps['onDeleteSubtask']
  onMove: TaskEditorProps['onMoveSubtask']
}) {
  const [title, setTitle] = useState(subtask.title)
  return (
    <div className="subtask-row">
      <input
        type="checkbox"
        aria-label={`完成 ${subtask.title}`}
        checked={subtask.completed}
        disabled={busy}
        onChange={(event) => void onUpdate(subtask, title, event.target.checked)}
      />
      <input
        aria-label={`编辑 ${subtask.title}`}
        value={title}
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title.trim() && title.trim() !== subtask.title && void onUpdate(subtask, title, subtask.completed)}
      />
      <button type="button" aria-label="上移" disabled={busy || first} onClick={() => void onMove(subtask, -1)}>↑</button>
      <button type="button" aria-label="下移" disabled={busy || last} onClick={() => void onMove(subtask, 1)}>↓</button>
      <button type="button" aria-label="删除子任务" disabled={busy} onClick={() => void onDelete(subtask)}>删除</button>
    </div>
  )
}
