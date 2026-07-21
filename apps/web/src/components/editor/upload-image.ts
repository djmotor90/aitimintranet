/** Re-export file upload helpers (kept for existing imports). */
export {
  collectImageFiles,
  collectFiles,
  formatFileSize,
  isImageFile,
  normalizeImageFile,
  uploadTaskFile,
  uploadTaskImage,
  type UploadedFile as UploadedImage,
  type UploadedFile,
} from "./upload-file";
