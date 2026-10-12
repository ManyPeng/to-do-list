import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { EntityMetadataFactory, TaskTemplate } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { RecurringTaskScheduler } from './recurringTaskScheduler'

const now = '2026-09-11T08:00:00.000Z'

function template(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: '学习英语',
    description: '完成听力练习',
    category: 'family',
    repeatRule: { type: 'daily' },
    status: 'active',
    estimatedMinutes: 20,
    defaultPriority: 'high',
    startTime: '08:30',
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
    ...overrides,
  }
}

function metadata(): EntityMetadataFactory {
  let nextId = 2
  return {
    id: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
    now: () => now,
  }
}

describe('RecurringTaskScheduler', () => {
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
    return { data, scheduler: new RecurringTaskScheduler(data, metadata()) }
  }

  it('为每天模板创建字段快照且重复调用保持幂等', async () => {
    const { data, scheduler } = setup('daily')
    const source = template()
    await data.templates.save(source)

    const first = await scheduler.ensureInstancesForDate('2026-09-11')
    const second = await scheduler.ensureInstancesForDate('2026-09-11')

    expect(first.created).toHaveLength(1)
    expect(second.created).toHaveLength(0)
    expect(await data.tasks.find()).toEqual([
      expect.objectContaining({
        templateId: source.id,
        title: source.title,
        description: source.description,
        category: 'family',
        priority: source.defaultPriority,
        estimatedMinutes: source.estimatedMinutes,
        startTime: source.startTime,
        scheduledDate: '2026-09-11',
        originalScheduledDate: '2026-09-11',
        source: 'recurring',
        status: 'todo',
      }),
    ])
  })

  it('按设备本地星期匹配周重复规则', async () => {
    const { data, scheduler } = setup('weekly')
    await data.templates.save(template({ repeatRule: { type: 'weekly', weekdays: [1, 3] } }))

    expect((await scheduler.ensureInstancesForDate('2026-09-14')).created).toHaveLength(1)
    expect((await scheduler.ensureInstancesForDate('2026-09-15')).created).toHaveLength(0)
    expect((await scheduler.ensureInstancesForDate('2026-09-16')).created).toHaveLength(1)
  })

  it('暂停和归档模板不生成新实例，但保留已有实例', async () => {
    const { data, scheduler } = setup('inactive')
    const source = template()
    await data.templates.save(source)
    await scheduler.ensureInstancesForDate('2026-09-11')

    await data.templates.save({ ...source, status: 'paused', updatedAt: '2026-09-12T08:00:00.000Z' })
    expect((await scheduler.ensureInstancesForDate('2026-09-12')).created).toHaveLength(0)

    await data.templates.save({ ...source, status: 'archived', updatedAt: '2026-09-13T08:00:00.000Z' })
    expect((await scheduler.ensureInstancesForDate('2026-09-13')).created).toHaveLength(0)
    expect(await data.tasks.find()).toHaveLength(1)
  })

  it('模板修改只影响之后生成的实例', async () => {
    const { data, scheduler } = setup('snapshot')
    const source = template()
    await data.templates.save(source)
    await scheduler.ensureInstancesForDate('2026-09-11')

    await data.templates.save({ ...source, title: '英语阅读', estimatedMinutes: 30, updatedAt: '2026-09-12T08:00:00.000Z' })
    await scheduler.ensureInstancesForDate('2026-09-12')

    expect((await data.tasks.find({ scheduledDate: '2026-09-11' }))[0].title).toBe('学习英语')
    expect((await data.tasks.find({ scheduledDate: '2026-09-12' }))[0]).toEqual(
      expect.objectContaining({ title: '英语阅读', estimatedMinutes: 30 }),
    )
  })
})
