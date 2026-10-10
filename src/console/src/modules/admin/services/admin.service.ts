import api from "@/services/api";

// Response shapes — mirror the Go backend exactly (contract-first,
// docs/apis/admin-api.md + backend/internal/modules/admin).

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
}

export type UserStatus = "active" | "disabled" | "locked";

// AdminUserResponse = UserResponse + { roles, two_factor_enabled }.
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
  roles: RoleSummary[];
  two_factor_enabled: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListUsersParams {
  q?: string;
  status?: string;
  page: number;
  page_size: number;
  sort?: string;
}

export interface CreateUserBody {
  email: string;
  full_name: string;
  role_ids?: string[];
}

export interface UpdateUserBody {
  full_name?: string;
  status?: Exclude<UserStatus, "locked">;
  /** Replaces the user's single role. super_admin only (BE-enforced). */
  role_id?: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  member_count: number;
  permission_count: number;
  updated_at: string;
  /** Present on detail (GET /roles/{id}) only — permission CODES. */
  permissions?: string[];
}

export interface PermissionItem {
  id: string;
  code: string;
  description: string | null;
}

export interface PermissionGroup {
  resource: string;
  permissions: PermissionItem[];
}

export interface AdminSession {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  current: boolean;
  is_last_super_admin: boolean;
}

export interface ListSessionsParams {
  user_id?: string;
  active?: boolean;
  page: number;
  page_size: number;
}

export const adminService = {
  async listUsers(params: ListUsersParams): Promise<Page<AdminUser>> {
    const { data } = await api.get<Page<AdminUser>>("/admin/users", { params });
    return data;
  },

  async createUser(body: CreateUserBody): Promise<AdminUser> {
    // No password — the BE emails a set-password link (workflows §1).
    const { data } = await api.post<AdminUser>("/admin/users", body);
    return data;
  },

  async updateUser(id: string, body: UpdateUserBody): Promise<AdminUser> {
    const { data } = await api.patch<AdminUser>(`/admin/users/${id}`, body);
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    // Soft delete by default (status=disabled); hard delete is API/ops only.
    await api.delete(`/admin/users/${id}`);
  },

  async resetPassword(id: string): Promise<void> {
    // 202 — the BE emails a reset link; the admin never sees the password.
    await api.post(`/admin/users/${id}/reset-password`, {});
  },

  // Roles
  async listRoles(): Promise<Role[]> {
    const { data } = await api.get<Role[]>("/admin/roles");
    return data;
  },

  async getRole(id: string): Promise<Role> {
    const { data } = await api.get<Role>(`/admin/roles/${id}`);
    return data;
  },

  // Permissions (read-only catalog, grouped by resource)
  async listPermissions(): Promise<PermissionGroup[]> {
    const { data } = await api.get<PermissionGroup[]>("/admin/permissions");
    return data;
  },

  // Sessions
  async listSessions(params: ListSessionsParams): Promise<Page<AdminSession>> {
    const { data } = await api.get<Page<AdminSession>>("/admin/sessions", {
      params,
    });
    return data;
  },

  async revokeSession(id: string): Promise<void> {
    await api.delete(`/admin/sessions/${id}`);
  },

  async revokeUserSessions(userId: string): Promise<void> {
    await api.delete(`/admin/users/${userId}/sessions`);
  },
};
