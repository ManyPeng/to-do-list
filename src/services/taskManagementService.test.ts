import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskInput } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { IncompleteSubtasksError, TaskManagementService } from './taskManagementService'

const input: TaskInput = {
  title: '准备周报',
  scheduledDate: '2026-09-11',
  priority: 'high',
  estimatedMinutes: 30,
  dueDate: '2026-09-12',
  isFocused: false,
}

describe('TaskManagementService', () => {
  let database: AppDatabase | undefined

  afterEach(async () => {
    if (database) {
      database.close()
      await database.delete()
    }
  })

  function setup(name: string) {
    database = new AppDatabase(`${name}-${crypto.randomUUID()}`)
    const data = new DexieDataLayer(database)
    return { data, service: new TaskManagementService(data) }
  }

  it('创建灵活任务时默认进入 todo 并校验表单', async () => {
    const { service } = setup('create')
    const created = await service.createTask(input)

    expect(created).toEqual(expect.objectContaining({
      source: 'flexible',
      status: 'todo',
      category: 'personal',
      title: input.title,
      originalScheduledDate: input.scheduledDate,
      isArchived: false,
    }))
    await expect(service.createTask({ ...input, title: '' })).rejects.toBeTruthy()
    await expect(service.createTask({ ...input, dueDate: '2026-09-10' })).rejects.toBeTruthy()
  })

  it('创建和编辑家人相关任务时保存归属分类', async () => {
    const { service } = setup('category')
    const created = await service.createTask({ ...input, category: 'family' })
    expect(created.category).toBe('family')

    const updated = await service.updateTask(created.id, { ...input, category: 'personal' })
    expect(updated.category).toBe('personal')
  })

  it('支持归档并在删除任务时级联删除子任务', async () => {
    const { data, service } = setup('archive-delete')
    const archived = await service.createTask(input)
    await service.archiveTask(archived.id)
    expect((await data.tasks.getById(archived.id))?.isArchived).toBe(true)

    const deleted = await service.createTask({ ...input, title: '待删除' })
    await service.addSubtask(deleted.id, '子任务')
    await service.deleteTask(deleted.id)

    expect(await data.tasks.getById(deleted.id)).toBeUndefined()
    expect(await data.subtasks.findByTaskId(deleted.id)).toEqual([])
  })

  it('编辑计划日期时保留原计划日期并写入改期记录', async () => {
    const { data, service } = setup('update-date')
    const task = await service.createTask(input)

    const updated = await service.updateTask(task.id, { ...input, scheduledDate: '2026-09-13', dueDate: '2026-09-14' })
    const changes = await data.scheduleChanges.findByTaskId(task.id)

    expect(updated.originalScheduledDate).toBe('2026-09-11')
    expect(updated.scheduledDate).toBe('2026-09-13')
    expect(changes).toEqual([
      expect.objectContaining({ taskId: task.id, fromDate: '2026-09-11', toDate: '2026-09-13' }),
    ])
  })

  it('支持子任务增删改和排序归一化', async () => {
    const { data, service } = setup('subtasks')
    const task = await service.createTask(input)
    const first = await service.addSubtask(task.id, '第一项')
    const second = await service.addSubtask(task.id, '第二项')
    const third = await service.addSubtask(task.id, '第三项')

    await service.updateSubtask(second.id, task.id, '更新项', true)
    await service.moveSubtask(task.id, third.id, -1)
    let subtasks = await data.subtasks.findByTaskId(task.id)
    expect(subtasks.map(({ title, completed }) => [title, completed])).toEqual([
      ['第一项', false],
      ['第三项', false],
      ['更新项', true],
    ])

    await service.deleteSubtask(task.id, first.id)
    subtasks = await data.subtasks.findByTaskId(task.id)
    expect(subtasks.map(({ sortOrder }) => sortOrder)).toEqual([0, 1])
    await expect(service.updateSubtask(second.id, task.id, '  ', true)).rejects.toThrow('子任务标题不能为空')
  })

  it('未完成子任务时要求确认后才能完成父任务', async () => {
    const { data, service } = setup('complete')
    const task = await service.createTask(input)
    await service.addSubtask(task.id, '尚未完成')

    await expect(service.completeTask(task.id)).rejects.toBeInstanceOf(IncompleteSubtasksError)
    expect((await data.tasks.getById(task.id))?.status).toBe('todo')

    const completed = await service.completeTask(task.id, true)
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeTruthy()
  })

  it('全部子任务完成后可直接完成父任务', async () => {
    const { service } = setup('all-complete')
    const task = await service.createTask(input)
    const subtask = await service.addSubtask(task.id, '已完成')
    await service.updateSubtask(subtask.id, task.id, subtask.title, true)

    await expect(service.completeTask(task.id)).resolves.toEqual(
      expect.objectContaining({ status: 'completed' }),
    )
  })
})
