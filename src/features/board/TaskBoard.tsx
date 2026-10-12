import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Priority, Subtask, Task, TaskCategory, TaskInput, TaskSource, TaskStatus } from '../../domain'
import { dataLayer } from '../../infrastructure/db/repositories'
import { scheduleDate } from '../../services/scheduling'
import { IncompleteSubtasksError, TaskManagementService } from '../../services/taskManagementService'
import { TaskFlowService, type BoardTask } from '../../services/taskFlowService'
import { TaskEditor } from './TaskEditor'

const taskFlow = new TaskFlowService(dataLayer)
const taskManagement = new TaskManagementService(dataLayer)
const statuses: TaskStatus[] = ['todo', 'in_progress', 'completed']
const statusLabels: Record<TaskStatus, string> = { todo: 'To Do', in_progress: '进行中', completed: '已完成' }
const priorityLabels: Record<Priority, string> = { high: '高', medium: '中', low: '低' }
const sourceLabels: Record<TaskSource, string> = { recurring: '固定任务', flexible: '灵活任务', calendar: '日历导入' }
const categoryLabels: Record<TaskCategory, string> = { personal: '自己的任务', family: '家人相关' }

type FilterState = { focused: boolean; priority: Priority | ''; source: TaskSource | ''; category: TaskCategory | ''; overdue: boolean }
const emptyFilters: FilterState = { focused: false, priority: '', source: '', category: '', overdue: false }

function matchesFilters(item: BoardTask, filters: FilterState) {
  if (filters.focused && !item.task.isFocused) return false
  if (filters.priority && item.task.priority !== filters.priority) return false
  if (filters.source && item.task.source !== filters.source) return false
  if (filters.category && (item.task.category ?? 'personal') !== filters.category) return false
  if (filters.overdue && !item.overdue) return false
  return true
}

function TaskCard({ item, busy, onStatus, onFocus, onEdit }: {
  item: BoardTask
  busy: boolean
  onStatus: (task: Task, status: TaskStatus) => void
  onFocus: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  const { task, subtasks } = item
  const completed = subtasks.filter((subtask) => subtask.completed).length
  return (
    <article className={`task-card priority-${task.priority}`}>
      <div className="task-card-heading">
        <div>
          <div className="task-badges">
            <span>{priorityLabels[task.priority]}优先级</span>
            <span>{sourceLabels[task.source]}</span>
            <span className={`category-badge category-${task.category ?? 'personal'}`}>{categoryLabels[task.category ?? 'personal']}</span>
            {subtasks.length > 0 && <span>子任务 {completed}/{subtasks.length}</span>}
            {item.carriedOver && <span className="warning-badge">结转 · {task.scheduledDate}</span>}
            {item.overdue && <span className="warning-badge">逾期</span>}
          </div>
          <h3>{task.title}</h3>
        </div>
        <button type="button" className={`focus-button ${task.isFocused ? 'active' : ''}`}
          aria-label={task.isFocused ? '取消今日重点' : '标记为今日重点'} aria-pressed={task.isFocused}
          disabled={busy} onClick={() => onFocus(task)}>
          {task.isFocused ? '重点' : '设为重点'}
        </button>
      </div>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        {task.estimatedMinutes && <span>{task.estimatedMinutes} 分钟</span>}
        {task.startTime && <span>{task.startTime}</span>}
        {task.dueDate && <span>截止 {task.dueDate}</span>}
        {task.completedAt && <span>完成 {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <div className="task-actions">
        <button type="button" disabled={busy} onClick={() => onEdit(task)}>编辑</button>
        {task.status !== 'todo' && <button type="button" disabled={busy} onClick={() => onStatus(task, 'todo')}>移至 To Do</button>}
        {task.status !== 'in_progress' && <button type="button" disabled={busy} onClick={() => onStatus(task, 'in_progress')}>开始处理</button>}
        {task.status !== 'completed' && <button type="button" disabled={busy} onClick={() => onStatus(task, 'completed')}>标记完成</button>}
      </div>
    </article>
  )
}

export function TaskBoard({ date }: { date: string }) {
  const [items, setItems] = useState<BoardTask[]>([])
  const [activeStatus, setActiveStatus] = useState<TaskStatus>('todo')
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task>()
  const [editingSubtasks, setEditingSubtasks] = useState<Subtask[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      await scheduleDate(date)
      setItems(await taskFlow.getTasksForDate(date))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '任务加载失败')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filtered = useMemo(() => items.filter((item) => matchesFilters(item, filters)), [items, filters])
  const columns = useMemo(
    () => Object.fromEntries(statuses.map((status) => [status, filtered.filter(({ task }) => task.status === status)])) as Record<TaskStatus, BoardTask[]>,
    [filtered],
  )

  async function refresh(editorTaskId?: string) {
    const next = await taskFlow.getTasksForDate(date)
    setItems(next)
    if (editorTaskId) {
      const details = await taskManagement.getDetails(editorTaskId)
      setEditingTask(details.task)
      setEditingSubtasks(details.subtasks)
    }
  }

  async function run(task: Task, operation: () => Promise<unknown>) {
    setBusyId(task.id)
    setError(undefined)
    try {
      await operation()
      await refresh(editingTask?.id === task.id ? task.id : undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请重试')
    } finally {
      setBusyId(undefined)
    }
  }

  function changeStatus(task: Task, status: TaskStatus) {
    void run(task, async () => {
      if (status !== 'completed') return taskFlow.changeStatus(task.id, status)
      try {
        return await taskManagement.completeTask(task.id)
      } catch (caught) {
        if (!(caught instanceof IncompleteSubtasksError) || !window.confirm(caught.message)) throw caught
        return taskManagement.completeTask(task.id, true)
      }
    })
  }

  function toggleFocus(task: Task) {
    void run(task, () => taskFlow.setFocused(task.id, !task.isFocused, date))
  }

  async function openEditor(task?: Task) {
    setEditingTask(task)
    setEditingSubtasks(task ? (await taskManagement.getDetails(task.id)).subtasks : [])
    setEditorOpen(true)
  }

  async function editorOperation<T>(operation: () => Promise<T>, taskId = editingTask?.id, reloadEditor = true): Promise<T> {
    setBusyId(taskId ?? 'new')
    setError(undefined)
    try {
      const result = await operation()
      await refresh(reloadEditor ? taskId : undefined)
      return result
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请重试')
      throw caught
    } finally {
      setBusyId(undefined)
    }
  }

  async function saveTask(input: TaskInput) {
    try {
      if (editingTask) {
        await editorOperation(() => taskManagement.updateTask(editingTask.id, input))
      } else {
        const created = await editorOperation(() => taskManagement.createTask(input))
        setEditingTask(created)
        setEditingSubtasks([])
      }
    } catch { /* 错误已展示在看板 */ }
  }

  async function updateSubtask(subtask: Subtask, title: string, completed: boolean) {
    if (!editingTask) return
    const wasLast = !subtask.completed && completed && editingSubtasks.every((item) => item.id === subtask.id || item.completed)
    try {
      await editorOperation(() => taskManagement.updateSubtask(subtask.id, editingTask.id, title, completed))
      if (wasLast && editingTask.status !== 'completed' && window.confirm('全部子任务已完成，是否完成父任务？')) {
        await editorOperation(() => taskManagement.completeTask(editingTask.id), editingTask.id)
      }
    } catch { /* 错误已展示在看板 */ }
  }

  const editorBusy = busyId === (editingTask?.id ?? 'new')

  return (
    <section className="board" aria-labelledby="board-title">
      <header className="board-header">
        <div><p className="eyebrow">Daily Flow</p><h1 id="board-title">{date}</h1><p>聚焦今天最重要的行动，一次推进少数任务。</p></div>
        <div className="board-header-actions">
          <button type="button" className="primary-button" onClick={() => void openEditor()}>新建任务</button>
          <button type="button" className="refresh-button" onClick={() => void load()} disabled={loading}>刷新</button>
        </div>
      </header>

      <div className="filter-bar" aria-label="任务筛选">
        <button type="button" className={filters.focused ? 'active' : ''} aria-pressed={filters.focused}
          onClick={() => setFilters((current) => ({ ...current, focused: !current.focused }))}>今日重点</button>
        <select aria-label="按优先级筛选" value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as Priority | '' }))}>
          <option value="">全部优先级</option><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option>
        </select>
        <select aria-label="按来源筛选" value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value as TaskSource | '' }))}>
          <option value="">全部来源</option><option value="recurring">固定任务</option><option value="flexible">灵活任务</option><option value="calendar">日历导入</option>
        </select>
        <select aria-label="按任务归属筛选" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as TaskCategory | '' }))}>
          <option value="">全部归属</option><option value="personal">自己的任务</option><option value="family">家人相关</option>
        </select>
        <button type="button" className={filters.overdue ? 'active' : ''} aria-pressed={filters.overdue}
          onClick={() => setFilters((current) => ({ ...current, overdue: !current.overdue }))}>仅逾期</button>
        {JSON.stringify(filters) !== JSON.stringify(emptyFilters) && <button type="button" onClick={() => setFilters(emptyFilters)}>清除筛选</button>}
      </div>

      {error && <div className="board-message error-message" role="alert">{error}</div>}
      {loading ? <div className="board-message">正在加载任务…</div> : <>
        <div className="status-tabs" role="tablist" aria-label="任务状态">
          {statuses.map((status) => <button key={status} type="button" role="tab" aria-selected={activeStatus === status}
            className={activeStatus === status ? 'active' : ''} onClick={() => setActiveStatus(status)}>{statusLabels[status]} <span>{columns[status].length}</span></button>)}
        </div>
        <div className="board-columns">
          {statuses.map((status) => <section key={status} className={`board-column ${activeStatus === status ? 'active' : ''}`} aria-labelledby={`${status}-heading`}>
            <header><h2 id={`${status}-heading`}>{statusLabels[status]}</h2><span>{columns[status].length}</span></header>
            <div className="task-list">
              {columns[status].map((item) => <TaskCard key={item.task.id} item={item} busy={busyId === item.task.id}
                onStatus={changeStatus} onFocus={toggleFocus} onEdit={(task) => void openEditor(task)} />)}
              {columns[status].length === 0 && <p className="empty-column">当前没有任务</p>}
            </div>
          </section>)}
        </div>
      </>}

      {editorOpen && <TaskEditor key={editingTask?.id ?? `new-${date}`} date={date} task={editingTask} subtasks={editingSubtasks} busy={editorBusy}
        onClose={() => setEditorOpen(false)} onSave={saveTask}
        onArchive={async () => {
          if (!editingTask) return
          try { await editorOperation(() => taskManagement.archiveTask(editingTask.id), editingTask.id, false); setEditorOpen(false) } catch { /* 已展示 */ }
        }}
        onDelete={async () => {
          if (!editingTask || !window.confirm(`确定删除“${editingTask.title}”及其子任务吗？`)) return
          try { await editorOperation(() => taskManagement.deleteTask(editingTask.id), editingTask.id, false); setEditorOpen(false) } catch { /* 已展示 */ }
        }}
        onAddSubtask={async (title) => { if (editingTask) try { await editorOperation(() => taskManagement.addSubtask(editingTask.id, title)) } catch { /* 已展示 */ } }}
        onUpdateSubtask={updateSubtask}
        onDeleteSubtask={async (subtask) => { if (editingTask) try { await editorOperation(() => taskManagement.deleteSubtask(editingTask.id, subtask.id)) } catch { /* 已展示 */ } }}
        onMoveSubtask={async (subtask, direction) => { if (editingTask) try { await editorOperation(() => taskManagement.moveSubtask(editingTask.id, subtask.id, direction)) } catch { /* 已展示 */ } }} />}
    </section>
  )
}
