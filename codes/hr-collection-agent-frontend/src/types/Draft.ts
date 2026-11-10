// Mirror of OpenAPI 0.1.1 draft schemas (see ResumeModel.ts for the maintenance rule).
import type { ResumeFields, ResumeFieldsUpdate } from './ResumeModel';

export type OriginalFileContentType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface OriginalFileInfo {
  /** Original file name, display only. */
  filename: string;
  content_type: OriginalFileContentType;
  /** 1 .. 10485760 */
  size_bytes: number;
}

export interface DraftResponse {
  draft_id: string;
  original_file: OriginalFileInfo;
  fields: ResumeFields;
  /** ISO 8601 UTC */
  created_at: string;
  /** ISO 8601 UTC */
  updated_at: string;
  /** ISO 8601 UTC; the draft is cleaned up at this time if there is no further activity. */
  expires_at: string;
}

export interface DraftUpdateRequest {
  fields: ResumeFieldsUpdate;
}
