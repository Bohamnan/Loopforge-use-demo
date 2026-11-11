// Mirror of OpenAPI 0.2.0 resume schemas (see ResumeModel.ts for the maintenance rule).

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

export interface UpdateResumeRequest {
  /** Explicit confirmation on the diff card; must be true or the backend answers confirmation_required. */
  confirm_update: boolean;
}

export interface UpdateResumeResponse {
  resume_id: string;
  /** ISO 8601 UTC. */
  updated_at: string;
}
