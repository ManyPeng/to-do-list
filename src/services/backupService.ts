import type { BackupFile, Settings, Snapshot, SnapshotPayload, SnapshotSource } from '../domain'
import { backupFileSchema, settingsSchema, snapshotPayloadSchema, toLocalDate } from '../domain'
import { DATABASE_VERSION } from '../infrastructure/db/appDatabase'
import type { DataLayer } from '../repositories'
import type { BackupDataStore, SnapshotRepository } from '../repositories/database'

const DAY_MS = 86_400_000
const SETTINGS_ID = '00000000-0000-4000-8000-000000000001'

type BackupDataLayer = DataLayer & BackupDataStore & { snapshots: SnapshotRepository }

export function createDefaultSettings(now = new Date()): Settings {
  const timestamp = now.toISOString()
  return {
    id: SETTINGS_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'local',
    wipLimit: 3,
    focusLimit: 3,
    snapshotRetentionCount: 14,
    externalBackupReminderDays: 7,
  }
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

export class BackupService {
  private readonly data: BackupDataLayer

  constructor(data: BackupDataLayer) {
    this.data = data
  }

  async getSettings() {
    const existing = await this.data.settings.get()
    if (existing) return existing
    const settings = createDefaultSettings()
    await this.data.settings.save(settings)
    return settings
  }

  async listSnapshots() {
    return this.data.snapshots.findAll()
  }

  async updateSettings(values: Pick<Settings, 'wipLimit' | 'focusLimit' | 'snapshotRetentionCount' | 'externalBackupReminderDays'>) {
    const current = await this.getSettings()
    const updated = settingsSchema.parse({
      ...current,
      ...values,
      updatedAt: new Date().toISOString(),
      syncState: 'local',
    })
    await this.data.settings.save(updated)
    await this.pruneAutoSnapshots(updated.snapshotRetentionCount)
    return updated
  }

  async createSnapshot(source: SnapshotSource = 'manual', now = new Date()) {
    const settings = await this.getSettings()
    const date = toLocalDate(now)
    if (source === 'auto') {
      const sameDay = await this.data.snapshots.findBySourceAndDate('auto', date)
      if (sameDay) return sameDay
      if (settings.lastSnapshotAt && now.getTime() - Date.parse(settings.lastSnapshotAt) < DAY_MS) return undefined
    }

    const payload = await this.data.readSnapshotPayload()
    const timestamp = now.toISOString()
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      syncState: 'local',
      snapshotDate: date,
      schemaVersion: DATABASE_VERSION,
      source,
      payload,
    }
    await this.data.snapshots.save(snapshot)
    if (source === 'auto') {
      await this.data.settings.save({ ...settings, lastSnapshotAt: timestamp, updatedAt: timestamp })
      await this.pruneAutoSnapshots(settings.snapshotRetentionCount)
    }
    return snapshot
  }

  async ensureDailySnapshot(now = new Date()) {
    return this.createSnapshot('auto', now)
  }

  async pruneAutoSnapshots(retentionCount: number) {
    const snapshots = (await this.data.snapshots.findAll()).filter((item) => item.source === 'auto')
    await Promise.all(snapshots.slice(retentionCount).map((item) => this.data.snapshots.delete(item.id)))
  }

  async shouldRemindExternalBackup(now = new Date()) {
    const settings = await this.getSettings()
    if (settings.remindAfter && Date.parse(settings.remindAfter) > now.getTime()) return false
    if (!settings.lastExternalBackupAt) return true
    return now.getTime() - Date.parse(settings.lastExternalBackupAt) >= settings.externalBackupReminderDays * DAY_MS
  }

  async remindLater(days = 1, now = new Date()) {
    const settings = await this.getSettings()
    await this.data.settings.save({
      ...settings,
      remindAfter: new Date(now.getTime() + days * DAY_MS).toISOString(),
      updatedAt: now.toISOString(),
    })
  }

  async exportBackup(now = new Date()): Promise<BackupFile> {
    const payload = await this.data.readSnapshotPayload()
    const backup = { schemaVersion: DATABASE_VERSION, exportedAt: now.toISOString(), payload }
    const settings = await this.getSettings()
    await this.data.settings.save({
      ...settings,
      lastExternalBackupAt: backup.exportedAt,
      remindAfter: undefined,
      updatedAt: backup.exportedAt,
    })
    return backup
  }

  parseBackup(json: string): BackupFile {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw new BackupValidationError('备份文件不是有效的 JSON')
    }
    const result = backupFileSchema.safeParse(value)
    if (!result.success) throw new BackupValidationError('备份文件结构不完整或字段无效')
    if (result.data.schemaVersion !== DATABASE_VERSION) {
      throw new BackupValidationError(`不支持的备份版本：${result.data.schemaVersion}`)
    }
    return result.data
  }

  async restoreBackup(json: string) {
    const backup = this.parseBackup(json)
    await this.restorePayload(backup.payload)
  }

  async restoreSnapshot(snapshotId: string) {
    const snapshot = await this.data.snapshots.getById(snapshotId)
    if (!snapshot) throw new BackupValidationError('找不到指定快照')
    if (snapshot.schemaVersion !== DATABASE_VERSION) throw new BackupValidationError('快照版本不兼容')
    await this.restorePayload(snapshot.payload)
  }

  private async restorePayload(payload: SnapshotPayload) {
    const parsed = snapshotPayloadSchema.safeParse(payload)
    if (!parsed.success) throw new BackupValidationError('恢复数据校验失败')
    await this.data.replaceBusinessData(parsed.data)
  }
}
