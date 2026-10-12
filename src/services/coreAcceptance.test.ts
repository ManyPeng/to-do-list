import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntityMetadataFactory, TaskTemplate } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { BackupService } from './backupService'
import { CalendarTransferService } from './calendarTransferService'
import { RecurringTaskScheduler } from './recurringTaskScheduler'
import { TaskFlowService } from './taskFlowService'

const templateId = '10000000-0000-4000-8000-000000000001'
const now = '2026-09-20T08:00:00.000Z'

function recurringTemplate(): TaskTemplate {
  return {
    id: templateId,
    title: '每日复盘',
    description: '记录今日进展',
    repeatRule: { type: 'daily' },
    status: 'active',
    estimatedMinutes: 15,
    defaultPriority: 'high',
    startTime: '20:00',
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
  }
}

function metadata(): EntityMetadataFactory {
  let sequence = 1
  return {
    id: () => `20000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    now: () => now,
  }
}

describe('核心端到端验收流程', () => {
  let database: AppDatabase
  let data: DexieDataLayer
  let backup: BackupService
  let scheduler: RecurringTaskScheduler
  let flow: TaskFlowService
  let calendar: CalendarTransferService

  beforeEach(() => {
    database = new AppDatabase(`acceptance-${crypto.randomUUID()}`)
    data = new DexieDataLayer(database)
    backup = new BackupService(data)
    scheduler = new RecurringTaskScheduler(data, metadata())
    flow = new TaskFlowService(data, {
      id: () => '30000000-0000-4000-8000-000000000001',
      now: () => now,
    })
    calendar = new CalendarTransferService(data)
  })

  afterEach(async () => {
    database.close()
    await database.delete()
  })

  it('串联首次启动、重复生成、流转、跨天、快照、提醒、恢复与 ICS 互导', async () => {
    const settings = await backup.getSettings()
    expect(settings.wipLimit).toBe(3)

    await data.templates.save(recurringTemplate())
    const firstGeneration = await scheduler.ensureInstancesForDate('2026-09-20')
    const repeatedGeneration = await scheduler.ensureInstancesForDate('2026-09-20')
    expect(firstGeneration.created).toHaveLength(1)
    expect(repeatedGeneration.created).toHaveLength(0)

    const generated = firstGeneration.created[0]
    await flow.changeStatus(generated.id, 'in_progress')
    const completed = await flow.complete(generated.id)
    expect(completed).toEqual(expect.objectContaining({ status: 'completed', completedAt: now }))

    const nextDay = await scheduler.ensureInstancesForDate('2026-09-21')
    expect(nextDay.created).toHaveLength(1)
    const carried = nextDay.created[0]
    await flow.changeStatus(carried.id, 'in_progress')
    const followingBoard = await flow.getTasksForDate('2026-09-22')
    expect(followingBoard).toEqual([
      expect.objectContaining({
        overdue: true,
        carriedOver: true,
        task: expect.objectContaining({ id: carried.id, status: 'in_progress' }),
      }),
    ])

    const firstSnapshot = await backup.ensureDailySnapshot(new Date('2026-09-20T10:00:00.000Z'))
    const repeatedSnapshot = await backup.ensureDailySnapshot(new Date('2026-09-20T11:00:00.000Z'))
    expect(repeatedSnapshot?.id).toBe(firstSnapshot?.id)
    expect(await backup.shouldRemindExternalBackup(new Date('2026-09-20T12:00:00.000Z'))).toBe(true)

    const exportedBackup = await backup.exportBackup(new Date('2026-09-20T12:00:00.000Z'))
    expect(await backup.shouldRemindExternalBackup(new Date('2026-09-20T12:01:00.000Z'))).toBe(false)
    await data.tasks.delete(generated.id)
    await backup.restoreBackup(JSON.stringify(exportedBackup))
    expect(await data.tasks.getById(generated.id)).toEqual(expect.objectContaining({ status: 'completed' }))

    const exportedCalendar = await calendar.exportTasks([generated.id])
    expect(exportedCalendar.content).toContain('BEGIN:VCALENDAR')
    const externalCalendar = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:external-acceptance-event',
      'DTSTART:20260923T013000Z',
      'DTEND:20260923T020000Z',
      'SUMMARY:外部日程',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const preview = await calendar.preview(externalCalendar, 'external.ics')
    expect(preview.errors).toHaveLength(0)
    expect(preview.items).toEqual([expect.objectContaining({ duplicate: false, selected: true })])
    expect(await calendar.importSelected(preview.items)).toEqual({ imported: 1, skipped: 0 })

    const duplicatePreview = await calendar.preview(externalCalendar, 'external.ics')
    expect(duplicatePreview.items[0]).toEqual(expect.objectContaining({ duplicate: true, selected: false }))
  })
})
