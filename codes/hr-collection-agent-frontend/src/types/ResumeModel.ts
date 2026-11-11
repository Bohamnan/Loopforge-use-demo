// Hand-written mirror of backend-docs/HR_PR-1/03_api/openapi.yaml (OpenAPI 0.2.0).
// Names match the OpenAPI schemas. Re-check this file whenever the contract changes (F-02).

/** OpenAPI version these types were written against. */
export const OPENAPI_VERSION = '0.2.0';

/** FieldStatus: recognized = awaiting confirmation, uncertain, missing, confirmed by the user (C-04). */
export const FIELD_STATUSES = ['recognized', 'uncertain', 'missing', 'confirmed'] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export interface WorkExperience {
  company?: string | null;
  position?: string | null;
  /** Looks like 2021.03 */
  start_date?: string | null;
  /** Looks like 2024.06 or 至今 */
  end_date?: string | null;
  department?: string | null;
  reports_to?: string | null;
  team_size?: string | null;
  responsibilities?: string[];
  achievements?: string[];
}

export interface ProjectExperience {
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  background?: string | null;
  role?: string | null;
  tech?: string | null;
  outcome?: string | null;
}

export interface Education {
  start_date?: string | null;
  end_date?: string | null;
  school?: string | null;
  major?: string | null;
  degree?: string | null;
  honors?: string | null;
}

export interface StringField {
  value: string | null;
  status: FieldStatus;
}

export interface StringListField {
  value: string[];
  status: FieldStatus;
}

export interface WorkExperienceListField {
  value: WorkExperience[];
  status: FieldStatus;
}

export interface ProjectExperienceListField {
  value: ProjectExperience[];
  status: FieldStatus;
}

export interface EducationListField {
  value: Education[];
  status: FieldStatus;
}

/** The 22 keys of ResumeFields, in contract order. */
export const RESUME_FIELD_KEYS = [
  'name',
  'job_title',
  'expected_city',
  'expected_salary',
  'available_time',
  'phone',
  'email',
  'homepage',
  'gender',
  'birth_month',
  'political_status',
  'current_city',
  'work_years',
  'highest_education',
  'strengths',
  'work_experiences',
  'project_experiences',
  'educations',
  'skills',
  'certificates_honors',
  'languages',
  'self_evaluation',
] as const;
export type ResumeFieldKey = (typeof RESUME_FIELD_KEYS)[number];

/** ResumeFields: every field carries a value and a status. name / phone / email are core fields. */
export interface ResumeFields {
  name: StringField;
  job_title: StringField;
  expected_city: StringField;
  expected_salary: StringField;
  available_time: StringField;
  phone: StringField;
  email: StringField;
  homepage: StringField;
  gender: StringField;
  birth_month: StringField;
  political_status: StringField;
  current_city: StringField;
  work_years: StringField;
  highest_education: StringField;
  strengths: StringListField;
  work_experiences: WorkExperienceListField;
  project_experiences: ProjectExperienceListField;
  educations: EducationListField;
  skills: StringListField;
  certificates_honors: StringListField;
  languages: StringListField;
  self_evaluation: StringField;
}

/**
 * ResumeFieldsUpdate: partial update. Fields that appear are set to confirmed by the backend.
 * Scalars may be null (confirm as empty) except the core fields; list fields may be [].
 * List fields are replaced as a whole (O-11).
 */
export interface ResumeFieldsUpdate {
  /** Core field, not empty. */
  name?: string;
  job_title?: string | null;
  expected_city?: string | null;
  expected_salary?: string | null;
  available_time?: string | null;
  /** Core field, not empty; send the value with spaces and hyphens already removed (G-02). */
  phone?: string;
  /** Core field, not empty. */
  email?: string;
  homepage?: string | null;
  gender?: string | null;
  birth_month?: string | null;
  political_status?: string | null;
  current_city?: string | null;
  work_years?: string | null;
  highest_education?: string | null;
  strengths?: string[];
  work_experiences?: WorkExperience[];
  project_experiences?: ProjectExperience[];
  educations?: Education[];
  skills?: string[];
  certificates_honors?: string[];
  languages?: string[];
  self_evaluation?: string | null;
}

/** ResumeValues: the 22 fields as values only, no field status (X-07). Used for saved content, archive detail and update candidates. */
export interface ResumeValues {
  name: string | null;
  job_title: string | null;
  expected_city: string | null;
  expected_salary: string | null;
  available_time: string | null;
  phone: string | null;
  email: string | null;
  homepage: string | null;
  gender: string | null;
  birth_month: string | null;
  political_status: string | null;
  current_city: string | null;
  work_years: string | null;
  highest_education: string | null;
  strengths: string[];
  work_experiences: WorkExperience[];
  project_experiences: ProjectExperience[];
  educations: Education[];
  skills: string[];
  certificates_honors: string[];
  languages: string[];
  self_evaluation: string | null;
}

/** SuggestionField: the 19 fields a chat suggestion may touch (whitelist; the three experience lists are excluded). */
export const SUGGESTION_FIELDS = [
  'name',
  'job_title',
  'expected_city',
  'expected_salary',
  'available_time',
  'phone',
  'email',
  'homepage',
  'gender',
  'birth_month',
  'political_status',
  'current_city',
  'work_years',
  'highest_education',
  'self_evaluation',
  'strengths',
  'skills',
  'certificates_honors',
  'languages',
] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];
