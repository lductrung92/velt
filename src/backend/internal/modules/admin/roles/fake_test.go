package roles

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
)

const statusActive = "active"

type memberUser struct {
	ID       uuid.UUID
	FullName string
	Email    string
	Status   string
}

// fakeRepo implements BOTH shared.SpineRepo and roles.Repository so the Base
// spine and the roles service read consistent in-memory state (mirrors the
// single fake the flat package used).
type fakeRepo struct {
	roles        map[uuid.UUID]*shared.Role
	byCode       map[string]uuid.UUID
	rolePerms    map[uuid.UUID]map[string]bool
	permIDByCode map[string]uuid.UUID
	permList     []PermissionItem
	users        map[uuid.UUID]memberUser
	userRoles    map[uuid.UUID]map[uuid.UUID]bool
	now          time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{
		roles: map[uuid.UUID]*shared.Role{}, byCode: map[string]uuid.UUID{},
		rolePerms: map[uuid.UUID]map[string]bool{}, permIDByCode: map[string]uuid.UUID{},
		users: map[uuid.UUID]memberUser{}, userRoles: map[uuid.UUID]map[uuid.UUID]bool{}, now: now,
	}
}

func (r *fakeRepo) ensurePerm(code string) uuid.UUID {
	if id, ok := r.permIDByCode[code]; ok {
		return id
	}
	id := uuid.New()
	r.permIDByCode[code] = id
	r.permList = append(r.permList, PermissionItem{ID: id, Code: code})
	return id
}

func (r *fakeRepo) codeForID(id uuid.UUID) string {
	for c, pid := range r.permIDByCode {
		if pid == id {
			return c
		}
	}
	return ""
}

func (r *fakeRepo) countMembers(roleID uuid.UUID) int {
	n := 0
	for _, roles := range r.userRoles {
		if roles[roleID] {
			n++
		}
	}
	return n
}

func (r *fakeRepo) addRole(code, name string, isSystem bool, permCodes ...string) *shared.Role {
	id := uuid.New()
	role := &shared.Role{ID: id, Code: code, Name: name, IsSystem: isSystem, UpdatedAt: r.now}
	r.roles[id] = role
	r.byCode[code] = id
	r.rolePerms[id] = map[string]bool{}
	for _, c := range permCodes {
		r.ensurePerm(c)
		r.rolePerms[id][c] = true
	}
	return role
}

func (r *fakeRepo) addUser(email, status string, roleIDs ...uuid.UUID) memberUser {
	u := memberUser{ID: uuid.New(), FullName: "User " + email, Email: email, Status: status}
	r.users[u.ID] = u
	r.userRoles[u.ID] = map[uuid.UUID]bool{}
	for _, rid := range roleIDs {
		r.userRoles[u.ID][rid] = true
	}
	return u
}

// --- shared.SpineRepo ---

func (r *fakeRepo) GetRole(_ context.Context, id uuid.UUID) (*shared.Role, error) {
	role, ok := r.roles[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *role
	return &cp, nil
}

func (r *fakeRepo) GetRoleByCode(_ context.Context, code string) (*shared.Role, error) {
	id, ok := r.byCode[code]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *r.roles[id]
	return &cp, nil
}

func (r *fakeRepo) RolePermissionCodes(_ context.Context, roleID uuid.UUID) ([]string, error) {
	var out []string
	for c := range r.rolePerms[roleID] {
		out = append(out, c)
	}
	sort.Strings(out)
	return out, nil
}

func (r *fakeRepo) PermissionCodesByIDs(_ context.Context, ids []uuid.UUID) ([]string, error) {
	var out []string
	for _, id := range ids {
		if c := r.codeForID(id); c != "" {
			out = append(out, c)
		}
	}
	return out, nil
}

func (r *fakeRepo) ActorEffectivePermissions(_ context.Context, actorID uuid.UUID) (map[string]bool, error) {
	set := map[string]bool{}
	for rid := range r.userRoles[actorID] {
		for c := range r.rolePerms[rid] {
			set[c] = true
		}
	}
	return set, nil
}

func (r *fakeRepo) ActiveSuperAdminIDs(_ context.Context) ([]uuid.UUID, error) {
	saID := r.byCode[shared.RoleSuperAdmin]
	var out []uuid.UUID
	for uid, roles := range r.userRoles {
		if roles[saID] && r.users[uid].Status == statusActive {
			out = append(out, uid)
		}
	}
	return out, nil
}

func (r *fakeRepo) UserIsSuperAdmin(_ context.Context, userID uuid.UUID) (bool, error) {
	saID := r.byCode[shared.RoleSuperAdmin]
	return r.userRoles[userID][saID], nil
}

// --- roles.Repository ---

func (r *fakeRepo) ListRoles(_ context.Context) ([]RoleResponse, error) {
	var out []RoleResponse
	for id, role := range r.roles {
		out = append(out, RoleResponse{
			ID: id, Code: role.Code, Name: role.Name, Description: role.Description,
			IsSystem: role.IsSystem, MemberCount: r.countMembers(id),
			PermissionCount: len(r.rolePerms[id]), UpdatedAt: role.UpdatedAt,
		})
	}
	return out, nil
}

func (r *fakeRepo) ListRoleMembers(_ context.Context, roleID uuid.UUID, _, _ int) ([]RoleMember, int, error) {
	var out []RoleMember
	for uid, roles := range r.userRoles {
		if roles[roleID] {
			u := r.users[uid]
			out = append(out, RoleMember{UserID: uid, FullName: u.FullName, Email: u.Email, AssignedAt: r.now})
		}
	}
	return out, len(out), nil
}

func (r *fakeRepo) CreateRole(_ context.Context, code, name string, desc *string, permIDs []uuid.UUID) (*shared.Role, error) {
	if _, ok := r.byCode[code]; ok {
		return nil, shared.ErrConflict
	}
	role := r.addRole(code, name, false)
	role.Description = desc
	for _, pid := range permIDs {
		r.rolePerms[role.ID][r.codeForID(pid)] = true
	}
	cp := *role
	return &cp, nil
}

func (r *fakeRepo) UpdateRoleMeta(_ context.Context, id uuid.UUID, name string, desc *string, expected time.Time) (time.Time, error) {
	role := r.roles[id]
	if role == nil {
		return time.Time{}, shared.ErrNotFound
	}
	if !role.UpdatedAt.Equal(expected) {
		return time.Time{}, shared.ErrConflict
	}
	role.Name = name
	role.Description = desc
	role.UpdatedAt = role.UpdatedAt.Add(time.Second)
	return role.UpdatedAt, nil
}

func (r *fakeRepo) ReplaceRolePermissions(_ context.Context, id uuid.UUID, permIDs []uuid.UUID, expected time.Time) (time.Time, error) {
	role := r.roles[id]
	if role == nil {
		return time.Time{}, shared.ErrNotFound
	}
	if !role.UpdatedAt.Equal(expected) {
		return time.Time{}, shared.ErrConflict
	}
	r.rolePerms[id] = map[string]bool{}
	for _, pid := range permIDs {
		r.rolePerms[id][r.codeForID(pid)] = true
	}
	role.UpdatedAt = role.UpdatedAt.Add(time.Second)
	return role.UpdatedAt, nil
}

func (r *fakeRepo) DeleteRole(_ context.Context, id uuid.UUID) error {
	if role, ok := r.roles[id]; ok {
		delete(r.byCode, role.Code)
	}
	delete(r.roles, id)
	delete(r.rolePerms, id)
	return nil
}

func (r *fakeRepo) CountRoleMembers(_ context.Context, roleID uuid.UUID) (int, error) {
	return r.countMembers(roleID), nil
}

func (r *fakeRepo) ListPermissions(_ context.Context) ([]PermissionItem, error) {
	out := append([]PermissionItem(nil), r.permList...)
	sort.Slice(out, func(i, j int) bool { return out[i].Code < out[j].Code })
	return out, nil
}

type tenv struct {
	svc  *Service
	repo *fakeRepo
	clk  time.Time
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	base := shared.NewBase(repo, nil, nil, nil, shared.Options{
		Now:    func() time.Time { return clk },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return &tenv{svc: NewService(base, repo), repo: repo, clk: clk}
}

func (e *tenv) actorWith(perms ...string) *httpx.Identity {
	role := e.repo.addRole("actor_"+uuid.NewString()[:8], "Actor", false, perms...)
	u := e.repo.addUser("actor-"+uuid.NewString()[:8]+"@x.test", statusActive, role.ID)
	return &httpx.Identity{UserID: u.ID, Permissions: append([]string(nil), perms...)}
}

func (e *tenv) superActor() *httpx.Identity {
	said, ok := e.repo.byCode[shared.RoleSuperAdmin]
	if !ok {
		said = e.repo.addRole(shared.RoleSuperAdmin, "Super Admin", true, "*").ID
	}
	u := e.repo.addUser("super-"+uuid.NewString()[:8]+"@x.test", statusActive, said)
	return &httpx.Identity{UserID: u.ID, Permissions: []string{"*"}}
}
