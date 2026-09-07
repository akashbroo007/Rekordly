import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared/contracts';
import type {
  DesktopApi,
  NotificationDto,
  PluginEventDto,
  MonitoringEventDto,
  RecordingEventDto,
  DownloadEventDto,
  UploadEventDto,
} from '@rekordly/shared/contracts';

const desktopApi: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
    getSystemStats: () => ipcRenderer.invoke(IPC_CHANNELS.appGetSystemStats),
    getProcessStats: () => ipcRenderer.invoke(IPC_CHANNELS.appGetProcessStats),
    getNetworkStats: () => ipcRenderer.invoke(IPC_CHANNELS.appGetNetworkStats),
    getPaths: () => ipcRenderer.invoke(IPC_CHANNELS.appGetPaths),
    openPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.appOpenPath, path),
    getHardwareProfile: () => ipcRenderer.invoke(IPC_CHANNELS.appGetHardwareProfile),
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized),
    onMaximizedChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized);
      };
      ipcRenderer.on(IPC_CHANNELS.windowMaximizedChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.windowMaximizedChanged, listener);
      };
    },
  },
  logs: {
    write: (entry) => ipcRenderer.invoke(IPC_CHANNELS.logsWrite, entry),
    list: (limit) => ipcRenderer.invoke(IPC_CHANNELS.logsList, limit),
  },
  settings: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll),
    set: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, patch),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.settingsReset),
    validate: (values) => ipcRenderer.invoke(IPC_CHANNELS.settingsValidate, values),
    importFromFile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsImport),
    exportToFile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsExport),
  },
  plugins: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.pluginsList),
    enable: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsEnable, id),
    disable: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsDisable, id),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsRemove, id),
    update: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsUpdate, id),
    installFromDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.pluginsInstall),
    getDiagnostics: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsDiagnostics, id),
    getHealth: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsHealth, id),
    getSettings: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsSettingsGet, id),
    getSettingsSchema: (id) => ipcRenderer.invoke(IPC_CHANNELS.pluginsSettingsSchema, id),
    setSettings: (id, values) => ipcRenderer.invoke(IPC_CHANNELS.pluginsSettingsSet, id, values),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, pluginEvent: PluginEventDto): void => {
        callback(pluginEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.pluginsEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.pluginsEvent, listener);
      };
    },
  },
  notifications: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.notificationsList),
    markRead: (id) => ipcRenderer.invoke(IPC_CHANNELS.notificationsMarkRead, id),
    markAllRead: () => ipcRenderer.invoke(IPC_CHANNELS.notificationsMarkAllRead),
    unreadCount: () => ipcRenderer.invoke(IPC_CHANNELS.notificationsUnreadCount),
    onNotification: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, notification: NotificationDto): void => {
        callback(notification);
      };
      ipcRenderer.on(IPC_CHANNELS.notificationsEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.notificationsEvent, listener);
      };
    },
  },
  creators: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.creatorsList),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.creatorsGet, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.creatorsCreate, data),
    update: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.creatorsUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.creatorsRemove, id),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.creatorsSearch, query),
    setFavorite: (id, favorite) => ipcRenderer.invoke(IPC_CHANNELS.creatorsSetFavorite, id, favorite),
    setAutoRecord: (id, enabled) => ipcRenderer.invoke(IPC_CHANNELS.creatorsSetAutoRecord, id, enabled),
    getTags: () => ipcRenderer.invoke(IPC_CHANNELS.creatorsGetTags),
    createTag: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.creatorsCreateTag, name, color),
    removeTag: (id) => ipcRenderer.invoke(IPC_CHANNELS.creatorsRemoveTag, id),
    renameTag: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.creatorsRenameTag, id, name),
    addTag: (creatorId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.creatorsAddTag, creatorId, tagId),
    removeTagFromCreator: (creatorId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.creatorsRemoveTagFromCreator, creatorId, tagId),
    listCreatorTags: (creatorId) => ipcRenderer.invoke(IPC_CHANNELS.creatorsListCreatorTags, creatorId),
    getCollections: () => ipcRenderer.invoke(IPC_CHANNELS.creatorsGetCollections),
    createCollection: (name, description) => ipcRenderer.invoke(IPC_CHANNELS.creatorsCreateCollection, name, description),
    removeCollection: (id) => ipcRenderer.invoke(IPC_CHANNELS.creatorsRemoveCollection, id),
    exportJson: () => ipcRenderer.invoke(IPC_CHANNELS.creatorsExportJson),
    exportCsv: () => ipcRenderer.invoke(IPC_CHANNELS.creatorsExportCsv),
    importJson: (data) => ipcRenderer.invoke(IPC_CHANNELS.creatorsImportJson, data),
    importCsv: (data) => ipcRenderer.invoke(IPC_CHANNELS.creatorsImportCsv, data),
  },
  recordings: {
    list: (limit) => ipcRenderer.invoke(IPC_CHANNELS.recordingsList, limit),
    recent: (limit) => ipcRenderer.invoke(IPC_CHANNELS.recordingsRecent, limit),
    countByStatus: () => ipcRenderer.invoke(IPC_CHANNELS.recordingsCountByStatus),
  },
  library: {
    search: (filters, sort, offset, limit) => ipcRenderer.invoke(IPC_CHANNELS.librarySearch, filters, sort, offset, limit),
    count: (filters) => ipcRenderer.invoke(IPC_CHANNELS.libraryCount, filters),
    getRecording: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryGetRecording, id),
    setFavorite: (id, favorite) => ipcRenderer.invoke(IPC_CHANNELS.librarySetFavorite, id, favorite),
    setNotes: (id, notes) => ipcRenderer.invoke(IPC_CHANNELS.librarySetNotes, id, notes),
    getTags: () => ipcRenderer.invoke(IPC_CHANNELS.libraryGetTags),
    createTag: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.libraryCreateTag, name, color),
    renameTag: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.libraryRenameTag, id, name),
    removeTag: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRemoveTag, id),
    addTag: (recordingId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.libraryAddTag, recordingId, tagId),
    removeTagFromRecording: (recordingId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.libraryRemoveTagFromRecording, recordingId, tagId),
    listRecordingTags: (recordingId) => ipcRenderer.invoke(IPC_CHANNELS.libraryListRecordingTags, recordingId),
    bulkFavorite: (ids, favorite) => ipcRenderer.invoke(IPC_CHANNELS.libraryBulkFavorite, ids, favorite),
    bulkAddTag: (ids, tagId) => ipcRenderer.invoke(IPC_CHANNELS.libraryBulkAddTag, ids, tagId),
    bulkRemoveTag: (ids, tagId) => ipcRenderer.invoke(IPC_CHANNELS.libraryBulkRemoveTag, ids, tagId),
    bulkDelete: (ids) => ipcRenderer.invoke(IPC_CHANNELS.libraryBulkDelete, ids),
    bulkMove: (ids, collectionId) => ipcRenderer.invoke(IPC_CHANNELS.libraryBulkMove, ids, collectionId),
    getCollections: () => ipcRenderer.invoke(IPC_CHANNELS.libraryGetCollections),
    createCollection: (name, description) => ipcRenderer.invoke(IPC_CHANNELS.libraryCreateCollection, name, description),
    renameCollection: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.libraryRenameCollection, id, name),
    removeCollection: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRemoveCollection, id),
    revealInExplorer: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.libraryRevealInExplorer, filePath),
    openFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.libraryOpenFile, filePath),
    copyPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.libraryCopyPath, filePath),
    deleteFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteFile, filePath),
    verifyFile: (recordingId) => ipcRenderer.invoke(IPC_CHANNELS.libraryVerifyFile, recordingId),
    refreshMetadata: (recordingId) => ipcRenderer.invoke(IPC_CHANNELS.libraryRefreshMetadata, recordingId),
    regenerateThumbnails: (ids) => ipcRenderer.invoke(IPC_CHANNELS.libraryRegenerateThumbnails, ids),
    scanFolder: () => ipcRenderer.invoke(IPC_CHANNELS.libraryScanFolder),
  },
  monitoring: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.monitoringStart),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.monitoringStop),
    pause: (creatorId) => ipcRenderer.invoke(IPC_CHANNELS.monitoringPause, creatorId),
    resume: (creatorId) => ipcRenderer.invoke(IPC_CHANNELS.monitoringResume, creatorId),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.monitoringGetStatus),
    getJobs: () => ipcRenderer.invoke(IPC_CHANNELS.monitoringGetJobs),
    getDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.monitoringGetDashboard),
    addCreator: (creatorId, pluginId, intervalMs) =>
      ipcRenderer.invoke(IPC_CHANNELS.monitoringAddCreator, creatorId, pluginId, intervalMs),
    removeCreator: (creatorId) => ipcRenderer.invoke(IPC_CHANNELS.monitoringRemoveCreator, creatorId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, monitoringEvent: MonitoringEventDto): void => {
        callback(monitoringEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.monitoringEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.monitoringEvent, listener);
      };
    },
  },
  recording: {
    start: (stream) => ipcRenderer.invoke(IPC_CHANNELS.recordingStart, stream),
    startForCreator: (
      creatorId,
      options?: { durationMinutes?: number; quality?: string; segmentMinutes?: number },
    ) => ipcRenderer.invoke(IPC_CHANNELS.recordingStartForCreator, { creatorId, options }),
    pause: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingPause, jobId),
    resume: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingResume, jobId),
    cancel: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingCancel, jobId),
    retry: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingRetry, jobId),
    restart: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingRestart, jobId),
    removeJob: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.recordingRemoveJob, jobId),
    clearFailed: () => ipcRenderer.invoke(IPC_CHANNELS.recordingClearFailed),
    getJobs: () => ipcRenderer.invoke(IPC_CHANNELS.recordingGetJobs),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.recordingGetSettings),
    setSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.recordingSetSettings, settings),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, recordingEvent: RecordingEventDto): void => {
        callback(recordingEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.recordingEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.recordingEvent, listener);
      };
    },
  },
  dashboard: {
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardGetStats),
  },
  downloads: {
    list: (status) => ipcRenderer.invoke(IPC_CHANNELS.downloadsList, status),
    probe: (url) => ipcRenderer.invoke(IPC_CHANNELS.downloadsProbe, url),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsGet, id),
    add: (item) => ipcRenderer.invoke(IPC_CHANNELS.downloadsAdd, item),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsRemove, id),
    pause: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsPause, id),
    resume: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsResume, id),
    cancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsCancel, id),
    retry: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsRetry, id),
    setPriority: (id, priority) => ipcRenderer.invoke(IPC_CHANNELS.downloadsSetPriority, id, priority),
    pauseAll: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsPauseAll),
    resumeAll: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsResumeAll),
    clearCompleted: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsClearCompleted),
    clearFailed: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsClearFailed),
    retryAll: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsRetryAll),
    countByStatus: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsCountByStatus),
    bulkRemove: (ids) => ipcRenderer.invoke(IPC_CHANNELS.downloadsBulkRemove, ids),
    bulkRetry: (ids) => ipcRenderer.invoke(IPC_CHANNELS.downloadsBulkRetry, ids),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, downloadEvent: DownloadEventDto): void => {
        callback(downloadEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.downloadsEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.downloadsEvent, listener);
      };
    },
  },
  uploads: {
    list: (status) => ipcRenderer.invoke(IPC_CHANNELS.uploadsList, status),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsGet, id),
    add: (item) => ipcRenderer.invoke(IPC_CHANNELS.uploadsAdd, item),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsRemove, id),
    pause: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsPause, id),
    resume: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsResume, id),
    cancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsCancel, id),
    retry: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsRetry, id),
    clearCompleted: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsClearCompleted),
    clearFailed: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsClearFailed),
    countByStatus: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsCountByStatus),
    pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsPickFile),
    providers: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsProviders),
    providersMeta: () => ipcRenderer.invoke(IPC_CHANNELS.uploadsProvidersMeta),
    testProvider: (id) => ipcRenderer.invoke(IPC_CHANNELS.uploadsTestProvider, id),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, uploadEvent: UploadEventDto): void => {
        callback(uploadEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.uploadsEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.uploadsEvent, listener);
      };
    },
  },
  storage: {
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.storageGetStats),
    scan: () => ipcRenderer.invoke(IPC_CHANNELS.storageScan),
    cleanup: (options) => ipcRenderer.invoke(IPC_CHANNELS.storageCleanup, options),
    getLargestRecordings: (limit) => ipcRenderer.invoke(IPC_CHANNELS.storageGetLargestRecordings, limit),
    getLargestFolders: (limit) => ipcRenderer.invoke(IPC_CHANNELS.storageGetLargestFolders, limit),
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
