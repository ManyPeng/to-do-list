import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task, TaskTemplate } from '../../domain'
import { DuplicateTaskInstanceError } from '../../repositories'
import { AppDatabase } from './appDatabase'
import { DexieDataLayer } from './repositories'

const now = '2026-09-11T08:00:00.000Z'
const templateId = '00000000-0000-4000-8000-000000000001'

function makeTemplate(): TaskTemplate {
  return {
    id: templateId,
    title: '学习英语',
    repeatRule: { type: 'daily' },
    status: 'active',
    estimatedMinutes: 20,
    defaultPriority: 'medium',
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
  }
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    templateId,
    source: 'recurring',
    status: 'todo',
    title: '学习英语',
    scheduledDate: '2026-09-11',
    originalScheduledDate: '2026-09-11',
    priority: 'medium',
    estimatedMinutes: 20,
    isFocused: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
    ...overrides,
  }
}

describe('DexieDataLayer', () => {
  let database: AppDatabase | undefined

  afterEach(async () => {
    if (database) {
      database.close()
      await database.delete()
    }
  })

  it('按计划日期和状态查询任务，并在重新打开后保留数据', async () => {
    database = new AppDatabase(`test-query-${crypto.randomUUID()}`)
    const data = new DexieDataLayer(database)
    const task = makeTask('00000000-0000-4000-8000-000000000002')
    await data.tasks.save(task)

    expect(await data.tasks.find({ scheduledDate: task.scheduledDate, status: 'todo' })).toEqual([task])

    database.close()
    await database.open()
    expect(await data.tasks.getById(task.id)).toEqual(task)
  })

  it('拒绝同一模板同一日期的重复实例', async () => {
    database = new AppDatabase(`test-unique-${crypto.randomUUID()}`)
    const data = new DexieDataLayer(database)
    await data.tasks.save(makeTask('00000000-0000-4000-8000-000000000003'))

    await expect(data.tasks.save(makeTask('00000000-0000-4000-8000-000000000004'))).rejects.toBeInstanceOf(DuplicateTaskInstanceError)
  })

  it('多表事务失败时回滚全部写入', async () => {
    database = new AppDatabase(`test-transaction-${crypto.randomUUID()}`)
    const data = new DexieDataLayer(database)

    await expect(data.transaction(async (repositories) => {
      await repositories.templates.save(makeTemplate())
      await repositories.tasks.save(makeTask('00000000-0000-4000-8000-000000000005'))
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    expect(await data.templates.getById(templateId)).toBeUndefined()
    expect(await data.tasks.find()).toEqual([])
  })
})