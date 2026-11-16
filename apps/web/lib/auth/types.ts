export type RoleBrief = {
  id: string;
  name: string;
};

export type AssignmentOut = {
  role: RoleBrief;
  department_id: string | null;
};

export type UserOut = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  initials: string;
  status: string;
};

export type DepartmentBrief = {
  id: string;
  code: string;
  name: string;
};

export type CurrentUser = {
  user: UserOut;
  assignments: AssignmentOut[];
  permissions: string[];
  departments: DepartmentBrief[];
  active_department_id: string | null;
  can_select_all_departments: boolean;
  koha_configured: boolean;
};