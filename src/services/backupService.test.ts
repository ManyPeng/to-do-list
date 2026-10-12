import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { BackupService } from './backupService'

function task(id: string, title: string) {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    syncState: 'local' as const,
    source: 'flexible' as const,
    status: 'todo' as const,
    title,
    scheduledDate: '2026-01-01',
    originalScheduledDate: '2026-01-01',
    priority: 'medium' as const,
    isFocused: false,
    isArchived: false,
  }
}

describe('BackupService', () => {
  let database: AppDatabase
  let data: DexieDataLayer
  let service: BackupService

  beforeEach(async () => {
    database = new AppDatabase(`backup-test-${crypto.randomUUID()}`)
    data = new DexieDataLayer(database)
    service = new BackupService(data)
    await service.getSettings()
  })

  afterEach(async () => {
    database.close()
    await database.delete()
  })

  it('同一天只创建一份自动快照', async () => {
    const first = await service.ensureDailySnapshot(new Date('2026-09-10T10:00:00.000Z'))
    const second = await service.ensureDailySnapshot(new Date('2026-09-10T11:00:00.000Z'))

    expect(first?.id).toBe(second?.id)
    expect(await database.snapshots.count()).toBe(1)
  })

  it('仅保留设置数量的自动快照', async () => {
    const settings = await service.getSettings()
    await data.settings.save({ ...settings, snapshotRetentionCount: 2 })

    await service.ensureDailySnapshot(new Date('2026-09-01T00:00:00.000Z'))
    await service.ensureDailySnapshot(new Date('2026-09-02T00:01:00.000Z'))
    await service.ensureDailySnapshot(new Date('2026-09-03T00:02:00.000Z'))

    expect(await database.snapshots.count()).toBe(2)
  })

  it('允许更新四项节奏设置并立即应用快照保留数', async () => {
    await service.ensureDailySnapshot(new Date('2026-09-01T00:00:00.000Z'))
    await service.ensureDailySnapshot(new Date('2026-09-02T00:01:00.000Z'))

    const updated = await service.updateSettings({
      wipLimit: 2,
      focusLimit: 1,
      snapshotRetentionCount: 1,
      externalBackupReminderDays: 14,
    })

    expect(updated).toEqual(expect.objectContaining({
      wipLimit: 2,
      focusLimit: 1,
      snapshotRetentionCount: 1,
      externalBackupReminderDays: 14,
    }))
    expect(await database.snapshots.count()).toBe(1)
  })

  it('导出后可覆盖恢复业务数据且保留快照', async () => {
    await data.tasks.save(task('10000000-0000-4000-8000-000000000001', '备份前任务'))
    const backup = await service.exportBackup(new Date('2026-09-11T00:00:00.000Z'))
    const snapshot = await service.createSnapshot('manual', new Date('2026-09-11T01:00:00.000Z'))
    await data.tasks.save(task('10000000-0000-4000-8000-000000000002', '后来任务'))

    await service.restoreBackup(JSON.stringify(backup))

    const tasks = await data.tasks.find({ includeArchived: true })
    expect(tasks.map((item) => item.title)).toEqual(['备份前任务'])
    expect(await data.snapshots.getById(snapshot!.id)).toBeDefined()
  })

  it('拒绝错误版本且不修改当前数据', async () => {
    await data.tasks.save(task('10000000-0000-4000-8000-000000000001', '当前任务'))
    const backup = await service.exportBackup()

    await expect(service.restoreBackup(JSON.stringify({ ...backup, schemaVersion: 999 }))).rejects.toThrow('不支持的备份版本')
    expect((await data.tasks.find()).map((item) => item.title)).toEqual(['当前任务'])
  })

  it('恢复写入失败时事务整体回滚', async () => {
    await data.tasks.save(task('10000000-0000-4000-8000-000000000001', '当前任务'))
    const backup = await service.exportBackup()
    backup.payload.tasks = [
      task('10000000-0000-4000-8000-000000000002', '冲突一'),
      task('10000000-0000-4000-8000-000000000003', '冲突二'),
    ].map((item) => ({ ...item, templateId: '20000000-0000-4000-8000-000000000001' }))

    await expect(service.restoreBackup(JSON.stringify(backup))).rejects.toThrow()
    expect((await data.tasks.find()).map((item) => item.title)).toEqual(['当前任务'])
  })

  it('根据七天间隔和稍后提醒计算提示状态', async () => {
    expect(await service.shouldRemindExternalBackup(new Date('2026-09-11T00:00:00.000Z'))).toBe(true)
    await service.remindLater(1, new Date('2026-09-11T00:00:00.000Z'))
    expect(await service.shouldRemindExternalBackup(new Date('2026-09-11T12:00:00.000Z'))).toBe(false)
  })
})
