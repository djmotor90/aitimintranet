/**
 * Max size for task attachments (paperclip, paste, drag-drop, description embeds).
 * Override at build/runtime with NEXT_PUBLIC_ATTACHMENT_MAX_MB (integer megabytes).
 */
const maxMb = Number(process.env.NEXT_PUBLIC_ATTACHMENT_MAX_MB ?? 200);

export const MAX_ATTACHMENT_MB =
  Number.isFinite(maxMb) && maxMb > 0 ? Math.min(maxMb, 2048) : 200;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export const MAX_ATTACHMENT_LABEL = `${MAX_ATTACHMENT_MB} MB`;
