import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task, TaskTemplate } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { HistoryService, calculateTemplateStreak } from './historyService'

const template: TaskTemplate = {
  id: 'template-1',
  title: '学习英语',
  repeatRule: { type: 'daily' },
  status: 'archived',
  estimatedMinutes: 20,
  defaultPriority: 'medium',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
  syncState: 'local',
}

function task(
  id: string,
  scheduledDate: string,
  completed = true,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    templateId: template.id,
    source: 'recurring',
    status: completed ? 'completed' : 'todo',
    title: template.title,
    scheduledDate,
    originalScheduledDate: scheduledDate,
    priority: 'medium',
    completedAt: completed ? `${scheduledDate}T08:00:00.000Z` : undefined,
    isFocused: false,
    isArchived: false,
    createdAt: `${scheduledDate}T00:00:00.000Z`,
    updatedAt: `${scheduledDate}T08:00:00.000Z`,
    syncState: 'local',
    ...overrides,
  }
}

describe('history statistics', () => {
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
    return { data, service: new HistoryService(data) }
  }

  it('按完成日期分组并保留已归档任务记录', async () => {
    const { data, service } = setup('daily-history')
    await data.tasks.saveMany([
      task('one', '2026-09-09', true, {
        completedAt: '2026-09-11T08:00:00.000Z',
        isArchived: true,
      }),
      task('two', '2026-09-11', true, {
        templateId: undefined,
        source: 'flexible',
        completedAt: '2026-09-11T09:00:00.000Z',
      }),
    ])

    const history = await service.listDailyCompletions()
    expect(history).toHaveLength(1)
    expect(history[0]).toEqual(expect.objectContaining({ date: '2026-09-11', count: 2 }))
    expect(history[0].tasks.map((item) => item.id)).toEqual(['two', 'one'])
  })

  it('计算每日任务当前与历史最长连续完成', () => {
    const result = calculateTemplateStreak(template, [
      task('one', '2026-09-07'),
      task('two', '2026-09-08'),
      task('three', '2026-09-09', false),
      task('four', '2026-09-10'),
      task('five', '2026-09-11'),
    ], '2026-09-11')

    expect(result).toEqual({ current: 2, longest: 2 })
  })

  it('按星期规则只计算应执行日期', () => {
    const weekly: TaskTemplate = {
      ...template,
      repeatRule: { type: 'weekly', weekdays: [1, 5] },
    }
    const result = calculateTemplateStreak(weekly, [
      task('fri', '2026-09-04'),
      task('mon', '2026-09-07'),
      task('next-fri', '2026-09-11'),
    ], '2026-09-11')

    expect(result).toEqual({ current: 3, longest: 3 })
  })

  it('暂停期间未生成实例的日期不打断连续完成', () => {
    const result = calculateTemplateStreak(template, [
      task('before-pause', '2026-09-07'),
      task('after-pause', '2026-09-11'),
    ], '2026-09-11')

    expect(result).toEqual({ current: 2, longest: 2 })
  })

  it('归档模板仍显示历史连续完成统计', async () => {
    const { data, service } = setup('archived-template')
    await data.templates.save(template)
    await data.tasks.saveMany([
      task('one', '2026-09-10'),
      task('two', '2026-09-11'),
    ])

    const streaks = await service.listTemplateStreaks('2026-09-11')
    expect(streaks[0]).toEqual(expect.objectContaining({
      current: 2,
      longest: 2,
      template: expect.objectContaining({ status: 'archived' }),
    }))
  })
})