import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * Application schema (Phase 2).
 * Conventions: ids are crypto-random TEXT; timestamps are ISO-8601 strings;
 * JSON payloads are stored as TEXT. Foreign keys are enforced (see client.ts).
 */

export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    /** JSON-encoded value; typed by the SettingsService schema. */
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('settings_updated_at_idx').on(table.updatedAt)],
);

export const plugins = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    /** Full manifest JSON, kept verbatim for diagnostics and upgrades. */
    manifest: text('manifest').notNull(),
    /** Entry module relative to the plugin directory (from the manifest). */
    entry: text('entry').notNull(),
    /** Absolute path to the plugin directory. */
    installPath: text('install_path').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    /** Permission ids granted by the user (JSON array of strings). */
    permissionsGranted: text('permissions_granted').notNull().default('[]'),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('plugins_name_idx').on(table.name)],
);

export const pluginData = sqliteTable(
  'plugin_data',
  {
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** JSON-encoded value. */
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.key] })],
);

export const pluginSettings = sqliteTable(
  'plugin_settings',
  {
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** JSON-encoded value; typed by the plugin's settings schema. */
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.key] })],
);

export const creators = sqliteTable(
  'creators',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    /** Platform-side identifier (plugin-owned, e.g. username). */
    externalId: text('external_id').notNull(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    profileUrl: text('profile_url'),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    /**
     * ponytail: per-creator auto-record opt-in. The engine only starts a
     * recording on `creator-live` when this is set — a global switch would
     * auto-record every creator and pile up storage silently.
     */
    autoRecord: integer('auto_record', { mode: 'boolean' }).notNull().default(false),
    /** Quality for this creator's auto-recordings ('best' | '1080p' | …). */
    autoRecordQuality: text('auto_record_quality').notNull().default('best'),
    /**
     * ponytail: per-creator secure-proxy opt-in. Site reachability differs
     * per user network (ISP/DNS blocks are regional), so this is a user
     * decision made per creator (Add/Edit dialog), not a plugin property.
     * When true, the host routes this creator's plugin traffic and recording
     * child processes through the embedded proxy.
     */
    useProxy: integer('use_proxy', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    /** JSON metadata snapshot provided by the plugin. */
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('creators_plugin_external_idx').on(table.pluginId, table.externalId),
    index('creators_username_idx').on(table.username),
    index('creators_display_name_idx').on(table.displayName),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    color: text('color'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('tags_name_idx').on(table.name)],
);

export const creatorTags = sqliteTable(
  'creator_tags',
  {
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.creatorId, table.tagId] }),
    index('creator_tags_tag_idx').on(table.tagId),
  ],
);

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('collections_name_idx').on(table.name)],
);

export const recordingJobs = sqliteTable(
  'recording_jobs',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'set null' }),
    pluginId: text('plugin_id').notNull(),
    streamUrl: text('stream_url').notNull(),
    title: text('title').notNull().default(''),
    platformId: text('platform_id').notNull().default(''),
    thumbnail: text('thumbnail'),
    quality: text('quality'),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    bytesDownloaded: integer('bytes_downloaded').notNull().default(0),
    speed: integer('speed').notNull().default(0),
    eta: integer('eta').notNull().default(0),
    percent: integer('percent').notNull().default(0),
    error: text('error'),
    /** ponytail: OS pid of the yt-dlp/ffmpeg child while the job is active —
     * used to re-adopt orphaned recordings after an app restart. */
    pid: integer('pid'),
    filePath: text('file_path'),
    thumbnailPath: text('thumbnail_path'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('recording_jobs_status_idx').on(table.status),
    index('recording_jobs_creator_idx').on(table.creatorId),
    index('recording_jobs_created_idx').on(table.createdAt),
  ],
);

export const recordings = sqliteTable(
  'recordings',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').references(() => creators.id, { onDelete: 'set null' }),
    jobId: text('job_id').references(() => recordingJobs.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    platformId: text('platform_id').notNull(),
    fileName: text('file_name'),
    filePath: text('file_path'),
    thumbnailPath: text('thumbnail_path'),
    status: text('status').notNull(),
    quality: text('quality'),
    resolution: text('resolution'),
    sizeBytes: integer('size_bytes'),
    durationSeconds: integer('duration_seconds'),
    videoCodec: text('video_codec'),
    audioCodec: text('audio_codec'),
    bitrate: integer('bitrate'),
    fps: integer('fps'),
    notes: text('notes'),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    /**
     * ponytail: built-in editor — id of the recording this row was cut from
     * (null for original captures). Plain TEXT without an FK: a self-FK would
     * hit TDZ issues at table definition and block deleting sources.
     * Originals are never touched; edits always create a new row + file.
     */
    sourceRecordingId: text('source_recording_id'),
    /** ponytail: built-in editor — JSON array of {op, params, createdAt}. */
    editHistory: text('edit_history'),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('recordings_creator_idx').on(table.creatorId),
    index('recordings_status_idx').on(table.status),
    index('recordings_platform_idx').on(table.platformId),
    index('recordings_started_idx').on(table.startedAt),
    index('recordings_favorite_idx').on(table.isFavorite),
    index('recordings_source_idx').on(table.sourceRecordingId),
  ],
);

export const collectionRecordings = sqliteTable(
  'collection_recordings',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    recordingId: text('recording_id')
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.recordingId] }),
    index('collection_recordings_recording_idx').on(table.recordingId),
  ],
);

export const recordingTags = sqliteTable(
  'recording_tags',
  {
    recordingId: text('recording_id')
      .notNull()
      .references(() => recordings.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.recordingId, table.tagId] }),
    index('recording_tags_tag_idx').on(table.tagId),
  ],
);

export const downloadQueue = sqliteTable(
  'download_queue',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    destination: text('destination').notNull(),
    fileName: text('file_name').notNull(),
    title: text('title'),
    pluginId: text('plugin_id'),
    creatorId: text('creator_id'),
    status: text('status').notNull().default('queued'),
    /** Which engine performed the transfer: 'http' (direct file) or 'ytdlp' (site extraction). */
    engine: text('engine').notNull().default('auto'),
    /** Extract audio only (MP3) instead of the full video (yt-dlp engine). */
    audioOnly: integer('audio_only', { mode: 'boolean' }).notNull().default(false),
    /** Requested quality: 'best' or a height like '1080p'. */
    quality: text('quality').notNull().default('best'),
    priority: integer('priority').notNull().default(0),
    bytesDownloaded: integer('bytes_downloaded').notNull().default(0),
    totalBytes: integer('total_bytes').notNull().default(0),
    speed: integer('speed').notNull().default(0),
    eta: integer('eta').notNull().default(0),
    percent: integer('percent').notNull().default(0),
    retries: integer('retries').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    error: text('error'),
    /** Absolute path of the finished file (or partial .part file while downloading). */
    filePath: text('file_path'),
    /** Absolute path of the downloaded thumbnail image (when available). */
    thumbnailPath: text('thumbnail_path'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('download_queue_status_idx').on(table.status),
    index('download_queue_priority_idx').on(table.priority),
    index('download_queue_created_idx').on(table.createdAt),
  ],
);

export const uploadQueue = sqliteTable(
  'upload_queue',
  {
    id: text('id').primaryKey(),
    recordingId: text('recording_id').references(() => recordings.id, { onDelete: 'set null' }),
    providerId: text('provider_id').notNull(),
    sourcePath: text('source_path').notNull(),
    destinationPath: text('destination_path'),
    status: text('status').notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    bytesUploaded: integer('bytes_uploaded').notNull().default(0),
    totalBytes: integer('total_bytes').notNull().default(0),
    speed: integer('speed').notNull().default(0),
    eta: integer('eta').notNull().default(0),
    percent: integer('percent').notNull().default(0),
    retries: integer('retries').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    error: text('error'),
    checksum: text('checksum'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('upload_queue_status_idx').on(table.status),
    index('upload_queue_provider_idx').on(table.providerId),
    index('upload_queue_created_idx').on(table.createdAt),
  ],
);

export const backgroundJobs = sqliteTable(
  'background_jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    payload: text('payload'),
    result: text('result'),
    error: text('error'),
    progress: integer('progress').notNull().default(0),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('background_jobs_type_idx').on(table.type),
    index('background_jobs_status_idx').on(table.status),
    index('background_jobs_created_idx').on(table.createdAt),
  ],
);

export const monitoringJobs = sqliteTable(
  'monitoring_jobs',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    state: text('state').notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    intervalMs: integer('interval_ms').notNull().default(300000),
    nextCheckAt: integer('next_check_at').notNull(),
    lastCheckAt: integer('last_check_at'),
    lastResult: text('last_result'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('monitoring_jobs_creator_idx').on(table.creatorId),
    index('monitoring_jobs_state_idx').on(table.state),
    index('monitoring_jobs_next_check_idx').on(table.nextCheckAt),
    index('monitoring_jobs_plugin_idx').on(table.pluginId),
  ],
);

export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    time: integer('time').notNull(),
    level: text('level').notNull(),
    scope: text('scope').notNull(),
    message: text('message').notNull(),
    /** JSON-encoded structured payload. */
    data: text('data'),
  },
  (table) => [index('logs_time_idx').on(table.time)],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    time: integer('time').notNull(),
    level: text('level').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    /** JSON-encoded structured payload. */
    data: text('data'),
  },
  (table) => [index('notifications_read_time_idx').on(table.read, table.time)],
);

export const settingsRelations = relations(settings, () => ({}));

export const pluginsRelations = relations(plugins, ({ many }) => ({
  data: many(pluginData),
  settings: many(pluginSettings),
}));

export const pluginDataRelations = relations(pluginData, ({ one }) => ({
  plugin: one(plugins, { fields: [pluginData.pluginId], references: [plugins.id] }),
}));

export const pluginSettingsRelations = relations(pluginSettings, ({ one }) => ({
  plugin: one(plugins, { fields: [pluginSettings.pluginId], references: [plugins.id] }),
}));

export const creatorsRelations = relations(creators, ({ many, one }) => ({
  tags: many(creatorTags),
  recordings: many(recordings),
  jobs: many(recordingJobs),
  monitoringJobs: many(monitoringJobs),
  plugin: one(plugins, { fields: [creators.pluginId], references: [plugins.id] }),
}));

export const creatorTagsRelations = relations(creatorTags, ({ one }) => ({
  creator: one(creators, { fields: [creatorTags.creatorId], references: [creators.id] }),
  tag: one(tags, { fields: [creatorTags.tagId], references: [tags.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  creators: many(creatorTags),
  recordings: many(recordingTags),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  recordings: many(collectionRecordings),
}));

export const recordingJobsRelations = relations(recordingJobs, ({ one }) => ({
  creator: one(creators, { fields: [recordingJobs.creatorId], references: [creators.id] }),
}));

export const recordingsRelations = relations(recordings, ({ many, one }) => ({
  creator: one(creators, { fields: [recordings.creatorId], references: [creators.id] }),
  job: one(recordingJobs, { fields: [recordings.jobId], references: [recordingJobs.id] }),
  collections: many(collectionRecordings),
  tags: many(recordingTags),
}));

export const collectionRecordingsRelations = relations(collectionRecordings, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionRecordings.collectionId],
    references: [collections.id],
  }),
  recording: one(recordings, {
    fields: [collectionRecordings.recordingId],
    references: [recordings.id],
  }),
}));

export const logsRelations = relations(logs, () => ({}));

export const notificationsRelations = relations(notifications, () => ({}));

export const monitoringJobsRelations = relations(monitoringJobs, () => ({}));

export const recordingTagsRelations = relations(recordingTags, ({ one }) => ({
  recording: one(recordings, { fields: [recordingTags.recordingId], references: [recordings.id] }),
  tag: one(tags, { fields: [recordingTags.tagId], references: [tags.id] }),
}));

export const downloadQueueRelations = relations(downloadQueue, () => ({}));
export const uploadQueueRelations = relations(uploadQueue, () => ({}));
export const backgroundJobsRelations = relations(backgroundJobs, () => ({}));
