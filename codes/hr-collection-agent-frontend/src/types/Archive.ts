// Mirror of OpenAPI 0.2.0 archive schemas (see ResumeModel.ts for the maintenance rule).
import type { ResumeValues } from './ResumeModel';
import type { OriginalFileInfo } from './Session';

export interface ArchivedResume {
  resume_id: string;
  fields: ResumeValues;
  original_file: OriginalFileInfo;
  /** false = details stay readable, the file endpoint answers file_not_available. */
  file_available: boolean;
  /** First save time; unchanged by updates. */
  saved_at: string;
  /** Equals saved_at when never updated. */
  updated_at: string;
}

export interface ResumeSummary {
  resume_id: string;
  name: string;
  phone: string;
  email: string;
  job_title: string | null;
  saved_at: string;
}

export interface ResumeListResponse {
  items: ResumeSummary[];
}
