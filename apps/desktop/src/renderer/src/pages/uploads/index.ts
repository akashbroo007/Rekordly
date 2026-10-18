/**
 * Uploads page surface — redesigned compose of UploadRow (queued /
 * uploading / completed / failed variants), UploadDayGroup, UploadsToolbar,
 * UploadsSummaryStrip, ProviderPicker, ProviderInfoCard and
 * UploadDropzone. Exported as a folder so `App.tsx` keeps importing
 * './pages/uploads' (same pattern as ./pages/recordings).
 */
export { UploadsPage } from './uploads-page';
