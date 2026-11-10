// Mirror of OpenAPI 0.1.1 resume schemas (see ResumeModel.ts for the maintenance rule).

export interface CreateResumeRequest {
  /** Explicit user confirmation; must be true or the backend answers confirmation_required. */
  confirmed: boolean;
}

export interface CreateResumeResponse {
  resume_id: string;
  /** true = the same person was saved before and nothing was added or overwritten. */
  already_saved: boolean;
  /** ISO 8601 UTC; the first save time when already_saved is true. */
  saved_at: string;
}
