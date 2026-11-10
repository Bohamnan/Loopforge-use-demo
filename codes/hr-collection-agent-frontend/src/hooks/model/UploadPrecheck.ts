// Pre-upload checks for user convenience only; the backend result is final (REQ-FE-01.2).
// Magic-byte checking is left to the backend (file_content_mismatch).

/** 10 MB (C-02, P-03). */
export const MAX_UPLOAD_BYTES = 10_485_760;

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type PrecheckFailure = 'unsupported_type' | 'too_large' | 'empty';

export type PrecheckResult = { ok: true } | { ok: false; reason: PrecheckFailure; message: string };

const MESSAGES: Record<PrecheckFailure, string> = {
  unsupported_type: '仅支持 PDF、JPG、JPEG、PNG 格式。',
  too_large: '文件超过 10 MB，请压缩后重试。',
  empty: '文件内容为空，请重新选择。',
};

export const MULTIPLE_FILES_NOTICE = '一次只能上传一个文件，已选择第一个。';

function fail(reason: PrecheckFailure): PrecheckResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function precheckFile(file: File): PrecheckResult {
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return fail('unsupported_type');
  }
  // Browsers may report an empty MIME type; then the extension decides.
  if (file.type !== '' && !(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return fail('unsupported_type');
  }
  if (file.size === 0) {
    return fail('empty');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail('too_large');
  }
  return { ok: true };
}

/** Only one file is accepted: take the first and report whether more were given. */
export function pickSingleFile(files: ArrayLike<File>): { file: File | null; multiple: boolean } {
  return { file: files[0] ?? null, multiple: files.length > 1 };
}

/**
 * True when a drag carries files. While dragging, browsers expose only `types` (files are readable on drop),
 * so `types` is checked first. Text and link drags are left alone (review SUGGEST-3).
 */
export function isFileDrag(transfer: Pick<DataTransfer, 'types' | 'files'> | null | undefined): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types ?? []).includes('Files') || (transfer.files?.length ?? 0) > 0;
}
