import { SUGGESTION_FIELDS, type ResumeFieldKey, type SuggestionField } from '../../types/ResumeModel';

// Section layout of the review page: the 22 ResumeFields keys grouped into 11 sections (design §4.2, P-04).
// Pure data, no DOM. Labels follow global-info/简历模板.md.

export const SECTION_KEYS = [
  'basic',
  'intent',
  'personal',
  'strengths',
  'work',
  'project',
  'education',
  'skills',
  'certificates',
  'languages',
  'self_evaluation',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type FieldKind = 'text' | 'textarea' | 'stringList' | 'objectList';

/** A sub-field of one item in an experience list (work / project / education). */
export interface ItemFieldConfig {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'stringList';
}

export interface ObjectItemConfig {
  /** Label for one item, e.g. "工作经历". */
  itemLabel: string;
  fields: readonly ItemFieldConfig[];
}

export interface FieldConfig {
  key: ResumeFieldKey;
  label: string;
  kind: FieldKind;
  /** name / phone / email: required before saving. */
  core: boolean;
  /** Present only for kind = objectList. */
  item?: ObjectItemConfig;
}

export interface SectionConfig {
  key: SectionKey;
  title: string;
  fields: readonly FieldConfig[];
  hasCore: boolean;
}

const text = (key: ResumeFieldKey, label: string, core = false): FieldConfig => ({ key, label, kind: 'text', core });
const list = (key: ResumeFieldKey, label: string): FieldConfig => ({ key, label, kind: 'stringList', core: false });

const section = (key: SectionKey, title: string, fields: readonly FieldConfig[]): SectionConfig => ({
  key,
  title,
  fields,
  hasCore: fields.some((f) => f.core),
});

const workItem: ObjectItemConfig = {
  itemLabel: '工作经历',
  fields: [
    { key: 'company', label: '公司名称', kind: 'text' },
    { key: 'position', label: '职位名称', kind: 'text' },
    { key: 'start_date', label: '开始时间', kind: 'text' },
    { key: 'end_date', label: '结束时间', kind: 'text' },
    { key: 'department', label: '部门', kind: 'text' },
    { key: 'reports_to', label: '汇报对象', kind: 'text' },
    { key: 'team_size', label: '团队规模', kind: 'text' },
    { key: 'responsibilities', label: '工作职责', kind: 'stringList' },
    { key: 'achievements', label: '主要业绩', kind: 'stringList' },
  ],
};

const projectItem: ObjectItemConfig = {
  itemLabel: '项目经历',
  fields: [
    { key: 'name', label: '项目名称', kind: 'text' },
    { key: 'start_date', label: '开始时间', kind: 'text' },
    { key: 'end_date', label: '结束时间', kind: 'text' },
    { key: 'background', label: '项目背景', kind: 'textarea' },
    { key: 'role', label: '我的角色', kind: 'text' },
    { key: 'tech', label: '技术 / 方法', kind: 'text' },
    { key: 'outcome', label: '项目成果', kind: 'textarea' },
  ],
};

const educationItem: ObjectItemConfig = {
  itemLabel: '教育背景',
  fields: [
    { key: 'start_date', label: '开始时间', kind: 'text' },
    { key: 'end_date', label: '结束时间', kind: 'text' },
    { key: 'school', label: '学校', kind: 'text' },
    { key: 'major', label: '专业', kind: 'text' },
    { key: 'degree', label: '学历', kind: 'text' },
    { key: 'honors', label: '在校荣誉', kind: 'text' },
  ],
};

export const SECTIONS: readonly SectionConfig[] = [
  section('basic', '基本信息', [
    text('name', '姓名', true),
    text('phone', '手机号', true),
    text('email', '邮箱', true),
    text('homepage', '个人主页'),
  ]),
  section('intent', '求职意向', [
    text('job_title', '意向岗位'),
    text('expected_city', '期望城市'),
    text('expected_salary', '期望薪资'),
    text('available_time', '到岗时间'),
  ]),
  section('personal', '个人信息', [
    text('gender', '性别'),
    text('birth_month', '出生年月'),
    text('political_status', '政治面貌'),
    text('current_city', '现居城市'),
    text('work_years', '工作年限'),
    text('highest_education', '最高学历'),
  ]),
  section('strengths', '个人优势', [list('strengths', '个人优势')]),
  section('work', '工作经历', [
    { key: 'work_experiences', label: '工作经历', kind: 'objectList', core: false, item: workItem },
  ]),
  section('project', '项目经历', [
    { key: 'project_experiences', label: '项目经历', kind: 'objectList', core: false, item: projectItem },
  ]),
  section('education', '教育背景', [
    { key: 'educations', label: '教育背景', kind: 'objectList', core: false, item: educationItem },
  ]),
  section('skills', '专业技能', [list('skills', '专业技能')]),
  section('certificates', '证书与荣誉', [list('certificates_honors', '证书与荣誉')]),
  section('languages', '语言能力', [list('languages', '语言能力')]),
  section('self_evaluation', '自我评价', [{ key: 'self_evaluation', label: '自我评价', kind: 'textarea', core: false }]),
];

export function getSection(key: SectionKey): SectionConfig {
  const found = SECTIONS.find((s) => s.key === key);
  if (!found) {
    throw new Error(`Unknown section: ${key}`);
  }
  return found;
}

export function sectionKeyOfField(field: ResumeFieldKey): SectionKey {
  const found = SECTIONS.find((s) => s.fields.some((f) => f.key === field));
  if (!found) {
    throw new Error(`Field not in any section: ${field}`);
  }
  return found.key;
}

/** Label of a suggestion / diff field. Throws for a field outside the 19-field whitelist (the shape check rejects such responses first). */
export function labelOfField(key: string): string {
  if (!(SUGGESTION_FIELDS as readonly string[]).includes(key)) {
    throw new Error(`Not a suggestion field: ${key}`);
  }
  const found = SECTIONS.flatMap((s) => s.fields).find((f) => f.key === (key as SuggestionField));
  if (!found) throw new Error(`No label for field: ${key}`);
  return found.label;
}
