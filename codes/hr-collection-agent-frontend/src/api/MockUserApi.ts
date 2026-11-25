import type { UserListQuery, UserListResult, UserRecord } from '../types/User';

/** Preset department options for filtering and synthetic dataset distribution (HR_PR-2). */
export const MOCK_DEPARTMENTS = ['研发部', '产品部', '人力资源部', '运营部'] as const;

const DEFAULT_DELAY_MS = 200;

/**
 * 28 synthetic, desensitized user records for static UI demonstration (B-06).
 * Covers 3 roles, 2 statuses, 4 departments, distinct created_at timestamps, and null/empty optional fields.
 */
export const MOCK_USERS: readonly UserRecord[] = [
  {
    user_id: 'U-1028',
    name: '陈思远',
    username: 'chensiyuan',
    gender: '男',
    phone: '138****8028',
    email: 'chensy@example.com',
    role: 'admin',
    department: '研发部',
    job_title: '技术总监',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-11-24T16:30:00Z',
    last_login_at: '2026-11-25T08:45:00Z',
    remark: '负责研发团队账号与权限统筹',
  },
  {
    user_id: 'U-1027',
    name: '林若曦',
    username: 'linruoxi',
    gender: '女',
    phone: '139****7027',
    email: 'linrx@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: '高级招聘专员',
    location: '上海总部 B 座',
    status: 'active',
    created_at: '2026-11-23T14:20:00Z',
    last_login_at: '2026-11-25T09:10:00Z',
    remark: '主要跟进研发与产品岗位招聘',
  },
  {
    user_id: 'U-1026',
    name: '张明远',
    username: 'zhangmingyuan',
    gender: '男',
    phone: '138****8001',
    email: 'zhangmy@example.com',
    role: 'member',
    department: '研发部',
    job_title: '前端工程师',
    location: '北京分部',
    status: 'active',
    created_at: '2026-11-22T11:15:00Z',
    last_login_at: '2026-11-24T17:50:00Z',
    remark: null,
  },
  {
    user_id: 'U-1025',
    name: '周雅婷',
    username: 'zhouyating',
    gender: null,
    phone: '137****6025',
    email: 'zhouyt@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: null,
    location: '',
    status: 'active',
    created_at: '2026-11-21T09:40:00Z',
    last_login_at: null,
    remark: '',
  },
  {
    user_id: 'U-1024',
    name: '王泽宇',
    username: 'wangzeyu',
    gender: '男',
    phone: '136****5024',
    email: 'wangzy@example.com',
    role: 'member',
    department: '产品部',
    job_title: '产品经理',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-11-20T15:05:00Z',
    last_login_at: '2026-11-24T10:30:00Z',
    remark: '负责 HR 招聘工作台产品规划',
  },
  {
    user_id: 'U-1023',
    name: '李晓雯',
    username: 'lixiaowen',
    gender: '女',
    phone: '135****4023',
    email: 'lixw@example.com',
    role: 'member',
    department: '运营部',
    job_title: '内容运营',
    location: '杭州分部',
    status: 'disabled',
    created_at: '2026-11-19T13:12:00Z',
    last_login_at: '2026-11-10T11:00:00Z',
    remark: '外包项目结束，账号已停用',
  },
  {
    user_id: 'U-1022',
    name: '赵子轩',
    username: 'zhaozixuan',
    gender: '男',
    phone: '138****8022',
    email: 'zhaozx@example.com',
    role: 'member',
    department: '研发部',
    job_title: '后端工程师',
    location: '深圳分部',
    status: 'active',
    created_at: '2026-11-18T10:30:00Z',
    last_login_at: '2026-11-24T19:20:00Z',
    remark: '接口服务维护成员',
  },
  {
    user_id: 'U-1021',
    name: '孙嘉琪',
    username: 'sunjiaqi',
    gender: '女',
    phone: '139****7021',
    email: 'sunjq@example.com',
    role: 'admin',
    department: '人力资源部',
    job_title: 'HRBP 主管',
    location: '上海总部 B 座',
    status: 'active',
    created_at: '2026-11-17T08:50:00Z',
    last_login_at: '2026-11-25T07:55:00Z',
    remark: '负责部门组织架构维护',
  },
  {
    user_id: 'U-1020',
    name: '吴浩然',
    username: 'wuhaoran',
    gender: '',
    phone: '137****6020',
    email: 'wuhr@example.com',
    role: 'member',
    department: '产品部',
    job_title: '交互设计师',
    location: null,
    status: 'active',
    created_at: '2026-11-16T16:18:00Z',
    last_login_at: '',
    remark: null,
  },
  {
    user_id: 'U-1019',
    name: '郑诗涵',
    username: 'zhengshihan',
    gender: '女',
    phone: '136****5019',
    email: 'zhengsh@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: '校园招聘专员',
    location: '北京分部',
    status: 'active',
    created_at: '2026-11-15T12:00:00Z',
    last_login_at: '2026-11-23T15:40:00Z',
    remark: '负责秋招简历初筛',
  },
  {
    user_id: 'U-1018',
    name: '冯宇航',
    username: 'fengyuhang',
    gender: '男',
    phone: '135****4018',
    email: 'fengyh@example.com',
    role: 'member',
    department: '运营部',
    job_title: '用户增长专员',
    location: '上海总部 C 座',
    status: 'active',
    created_at: '2026-11-14T11:25:00Z',
    last_login_at: '2026-11-22T14:15:00Z',
    remark: '渠道活动支持',
  },
  {
    user_id: 'U-1017',
    name: '朱梦瑶',
    username: 'zhumengyao',
    gender: '女',
    phone: '138****8017',
    email: 'zhumy@example.com',
    role: 'member',
    department: '研发部',
    job_title: '测试开发工程师',
    location: '杭州分部',
    status: 'disabled',
    created_at: '2026-11-13T09:10:00Z',
    last_login_at: '2026-11-01T10:00:00Z',
    remark: '调岗前旧账号已冻结',
  },
  {
    user_id: 'U-1016',
    name: '胡俊杰',
    username: 'hujunjie',
    gender: '男',
    phone: '139****7016',
    email: 'hujj@example.com',
    role: 'member',
    department: '研发部',
    job_title: '运维工程师',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-11-12T17:45:00Z',
    last_login_at: '2026-11-24T21:10:00Z',
    remark: '负责自动化发布保障',
  },
  {
    user_id: 'U-1015',
    name: '徐安琪',
    username: 'xuanqi',
    gender: '女',
    phone: '137****6015',
    email: 'xuaq@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: '薪酬绩效专员',
    location: '上海总部 B 座',
    status: 'active',
    created_at: '2026-11-11T14:30:00Z',
    last_login_at: '2026-11-24T12:05:00Z',
    remark: null,
  },
  {
    user_id: 'U-1014',
    name: '马博文',
    username: 'mabowen',
    gender: '男',
    phone: '136****5014',
    email: 'mabw@example.com',
    role: 'member',
    department: '产品部',
    job_title: null,
    location: '深圳分部',
    status: 'disabled',
    created_at: '2026-11-10T10:00:00Z',
    last_login_at: null,
    remark: '待入职预建账号（未激活）',
  },
  {
    user_id: 'U-1013',
    name: '高婧怡',
    username: 'gaojingyi',
    gender: '女',
    phone: '135****4013',
    email: 'gaojy@example.com',
    role: 'admin',
    department: '运营部',
    job_title: '运营总监',
    location: '上海总部 C 座',
    status: 'active',
    created_at: '2026-11-09T15:40:00Z',
    last_login_at: '2026-11-25T08:00:00Z',
    remark: '运营条线负责人',
  },
  {
    user_id: 'U-1012',
    name: '罗晨阳',
    username: 'luochenyang',
    gender: '男',
    phone: '138****8012',
    email: 'luocy@example.com',
    role: 'member',
    department: '研发部',
    job_title: '算法工程师',
    location: '北京分部',
    status: 'active',
    created_at: '2026-11-08T13:22:00Z',
    last_login_at: '2026-11-23T18:30:00Z',
    remark: '文档解析模型优化',
  },
  {
    user_id: 'U-1011',
    name: '何欣怡',
    username: 'hexinyi',
    gender: '女',
    phone: '139****7011',
    email: 'hexy@example.com',
    role: 'member',
    department: '运营部',
    job_title: '数据分析师',
    location: '杭州分部',
    status: 'active',
    created_at: '2026-11-07T09:15:00Z',
    last_login_at: '2026-11-21T16:45:00Z',
    remark: '周报指标统计',
  },
  {
    user_id: 'U-1010',
    name: '郭致远',
    username: 'guozhiyuan',
    gender: '男',
    phone: '137****6010',
    email: 'guozy@example.com',
    role: 'member',
    department: '产品部',
    job_title: '高级产品经理',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-11-06T18:05:00Z',
    last_login_at: '2026-11-24T11:20:00Z',
    remark: 'B 端表单流程负责人',
  },
  {
    user_id: 'U-1009',
    name: '宋婉清',
    username: 'songwanqing',
    gender: '女',
    phone: '136****5009',
    email: 'songwq@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: '员工关系专员',
    location: '深圳分部',
    status: 'disabled',
    created_at: '2026-11-05T11:50:00Z',
    last_login_at: '2026-10-28T09:10:00Z',
    remark: '休假期间临时停用',
  },
  {
    user_id: 'U-1008',
    name: '梁启明',
    username: 'liangqiming',
    gender: '男',
    phone: '135****4008',
    email: 'liangqm@example.com',
    role: 'member',
    department: '研发部',
    job_title: '全栈工程师',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-11-04T14:12:00Z',
    last_login_at: '2026-11-24T15:00:00Z',
    remark: '内部工具链开发',
  },
  {
    user_id: 'U-1007',
    name: '谢雨菲',
    username: 'xieyufei',
    gender: '女',
    phone: '138****8007',
    email: 'xieyf@example.com',
    role: 'member',
    department: '运营部',
    job_title: '活动运营',
    location: '北京分部',
    status: 'active',
    created_at: '2026-11-03T10:35:00Z',
    last_login_at: '2026-11-20T13:25:00Z',
    remark: null,
  },
  {
    user_id: 'U-1006',
    name: '唐天佑',
    username: 'tangtianyou',
    gender: '男',
    phone: '139****7006',
    email: 'tangty@example.com',
    role: 'member',
    department: '研发部',
    job_title: '数据工程师',
    location: '杭州分部',
    status: 'active',
    created_at: '2026-11-02T16:40:00Z',
    last_login_at: '2026-11-22T09:50:00Z',
    remark: '归档数据治理',
  },
  {
    user_id: 'U-1005',
    name: '韩可欣',
    username: 'hankexin',
    gender: '女',
    phone: '137****6005',
    email: 'hankx@example.com',
    role: 'hr',
    department: '人力资源部',
    job_title: '招聘协调员',
    location: '上海总部 B 座',
    status: 'active',
    created_at: '2026-11-01T08:20:00Z',
    last_login_at: '2026-11-23T10:12:00Z',
    remark: '面试日程统筹',
  },
  {
    user_id: 'U-1004',
    name: '曹俊驰',
    username: 'caojunchi',
    gender: '男',
    phone: '136****5004',
    email: 'caojc@example.com',
    role: 'member',
    department: '产品部',
    job_title: 'UI 设计师',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-10-31T15:10:00Z',
    last_login_at: '2026-11-19T17:30:00Z',
    remark: '组件库视觉规范维护',
  },
  {
    user_id: 'U-1003',
    name: '许知夏',
    username: 'xuzhixia',
    gender: '女',
    phone: '135****4003',
    email: 'xuzx@example.com',
    role: 'member',
    department: '运营部',
    job_title: '商务运营',
    location: '深圳分部',
    status: 'disabled',
    created_at: '2026-10-30T11:05:00Z',
    last_login_at: '2026-10-25T14:00:00Z',
    remark: '已转岗至外部合作组',
  },
  {
    user_id: 'U-1002',
    name: '邓子墨',
    username: 'dengzimo',
    gender: '男',
    phone: '138****8002',
    email: 'dengzm@example.com',
    role: 'admin',
    department: '产品部',
    job_title: '产品总监',
    location: '上海总部 A 座',
    status: 'active',
    created_at: '2026-10-29T09:30:00Z',
    last_login_at: '2026-11-24T18:10:00Z',
    remark: '产品委员会成员',
  },
  {
    user_id: 'U-1001',
    name: '沈清浅',
    username: 'shenqingqian',
    gender: null,
    phone: '139****7001',
    email: 'shenqq@example.com',
    role: 'member',
    department: '研发部',
    job_title: '',
    location: '',
    status: 'active',
    created_at: '2026-10-28T08:00:00Z',
    last_login_at: null,
    remark: null,
  },
];

function waitDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function matchesKeyword(user: UserRecord, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return true;
  return (
    user.name.toLowerCase().includes(normalizedKeyword) ||
    user.username.toLowerCase().includes(normalizedKeyword) ||
    user.phone.toLowerCase().includes(normalizedKeyword) ||
    user.email.toLowerCase().includes(normalizedKeyword)
  );
}

/**
 * Fetches a paginated mock user list from in-memory synthetic records.
 * Supports keyword fuzzy matching, status/role/department filtering, descending created_at order, and demo modes.
 */
export async function fetchMockUsers(
  query: UserListQuery,
  options?: { delayMs?: number },
): Promise<UserListResult> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  await waitDelay(delayMs);

  if (query.demoMode === 'error') {
    throw new Error('Mock user list request failed');
  }
  if (query.demoMode === 'empty') {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: query.pageSize,
    };
  }

  const normalizedKeyword = query.keyword.trim().toLowerCase();
  const filtered = MOCK_USERS.filter((user) => {
    if (!matchesKeyword(user, normalizedKeyword)) return false;
    if (query.status !== 'all' && user.status !== query.status) return false;
    if (query.role !== 'all' && user.role !== query.role) return false;
    if (query.department !== 'all' && user.department !== query.department) return false;
    return true;
  }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const pageSize = Math.max(1, query.pageSize);
  const page = Math.max(1, query.page);
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize).map((item) => ({ ...item })),
    total: filtered.length,
    page,
    pageSize,
  };
}

/**
 * Fetches a single synthetic user record by user_id from in-memory records.
 * Supports simulated delay and forced error for loading/retry UI testing.
 */
export async function fetchMockUserDetail(
  userId: string,
  options?: { delayMs?: number; forceError?: boolean },
): Promise<UserRecord> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  await waitDelay(delayMs);

  if (options?.forceError) {
    throw new Error('Mock user detail request failed');
  }

  const found = MOCK_USERS.find((user) => user.user_id === userId);
  if (!found) {
    throw new Error('Mock user record not found');
  }
  return { ...found };
}
