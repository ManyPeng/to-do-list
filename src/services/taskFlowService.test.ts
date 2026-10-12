import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Settings, Task } from '../domain'
import { FocusLimitExceededError, WipLimitExceededError } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { TaskFlowService } from './taskFlowService'

const changedAt = '2026-09-11T09:00:00.000Z'

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    source: 'flexible',
    status: 'todo',
    title: `任务 ${id}`,
    scheduledDate: '2026-09-10',
    originalScheduledDate: '2026-09-10',
    priority: 'medium',
    isFocused: false,
    isArchived: false,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    syncState: 'local',
    ...overrides,
  }
}

function settings(wipLimit: number): Settings {
  return {
    id: 'settings',
    wipLimit,
    focusLimit: 3,
    snapshotRetentionCount: 14,
    externalBackupReminderDays: 7,
    createdAt: changedAt,
    updatedAt: changedAt,
    syncState: 'local',
  }
}

describe('TaskFlowService', () => {
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
    const service = new TaskFlowService(data, {
      id: () => '00000000-0000-4000-8000-000000000099',
      now: () => changedAt,
    })
    return { data, service }
  }

  it('完成任务时记录完成时间，重开时清除完成时间', async () => {
    const { data, service } = setup('status')
    await data.tasks.save(task('task-1'))

    const completed = await service.complete('task-1')
    expect(completed).toEqual(
      expect.objectContaining({ status: 'completed', completedAt: changedAt }),
    )

    const reopened = await service.reopen('task-1', 'in_progress')
    expect(reopened.status).toBe('in_progress')
    expect(reopened.completedAt).toBeUndefined()
  })

  it('超过 WIP 上限时阻止进入进行中', async () => {
    const { data, service } = setup('wip')
    await data.settings.save(settings(1))
    await data.tasks.saveMany([
      task('active', { status: 'in_progress' }),
      task('candidate'),
    ])

    await expect(service.changeStatus('candidate', 'in_progress')).rejects.toBeInstanceOf(
      WipLimitExceededError,
    )
    expect((await data.tasks.getById('candidate'))?.status).toBe('todo')
  })

  it('今日查询合并历史未完成任务并保留进行中状态', async () => {
    const { data, service } = setup('carry-over')
    await data.tasks.saveMany([
      task('overdue-todo'),
      task('overdue-wip', { status: 'in_progress' }),
      task('old-completed', { status: 'completed', completedAt: changedAt }),
      task('today', { scheduledDate: '2026-09-11', originalScheduledDate: '2026-09-11' }),
      task('future', { scheduledDate: '2026-09-12', originalScheduledDate: '2026-09-12' }),
    ])

    const board = await service.getTasksForDate('2026-09-11')

    expect(board.map(({ task: item }) => item.id)).toEqual([
      'overdue-todo',
      'overdue-wip',
      'today',
    ])
    expect(board.find(({ task: item }) => item.id === 'overdue-wip')).toEqual(
      expect.objectContaining({ overdue: true, carriedOver: true }),
    )
    expect(board.find(({ task: item }) => item.id === 'overdue-wip')?.task.status).toBe(
      'in_progress',
    )
  })

  it('超过今日重点上限时阻止标记，并允许取消重点', async () => {
    const { data, service } = setup('focus')
    await data.settings.save({ ...settings(3), focusLimit: 1 })
  await data.tasks.saveMany([
      task('focused', { isFocused: true }),
      task('candidate'),
    ])

    await expect(service.setFocused('candidate', true)).rejects.toBeInstanceOf(
      FocusLimitExceededError,
    )
    expect((await data.tasks.getById('candidate'))?.isFocused).toBe(false)

    const updated = await service.setFocused('focused', false)
    expect(updated.isFocused).toBe(false)
  })

  it('主动改期时不复制任务并写入日期变更记录', async () => {
    const { data, service } = setup('reschedule')
    const original = task('task-1')
    await data.tasks.save(original)

    const updated = await service.reschedule(original.id, '2026-09-11')
    const changes = await data.scheduleChanges.findByTaskId(original.id)

    expect(updated).toEqual(
      expect.objectContaining({
        id: original.id,
        scheduledDate: '2026-09-11',
        originalScheduledDate: '2026-09-10',
      }),
    )
    expect(await data.tasks.find()).toHaveLength(1)
    expect(changes).toEqual([
      expect.objectContaining({
        taskId: original.id,
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        changedAt,
      }),
    ])
  })
})