package users

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
)

type fakeSession struct {
	userID  uuid.UUID
	revoked bool
}

// fakePassword records what SetPassword stored, so a test can assert the hash
// changed without ever seeing a plaintext.
type fakePassword struct {
	hash string
	at   time.Time
}

// fakeRepo implements BOTH shared.SpineRepo and users.Repository so the Base
// spine and the users service read consistent in-memory state.
type fakeRepo struct {
	users        map[uuid.UUID]*User
	byEmail      map[string]uuid.UUID
	userRoles    map[uuid.UUID]map[uuid.UUID]bool
	roles        map[uuid.UUID]*shared.Role
	byCode       map[string]uuid.UUID
	rolePerms    map[uuid.UUID]map[string]bool
	permIDByCode map[string]uuid.UUID
	tfEnabled    map[uuid.UUID]bool
	sessions     map[uuid.UUID]*fakeSession
	passwords    map[uuid.UUID]fakePassword
	// createdHash is the hash the last CreateUser was handed, so a test can
	// prove the service never stores a plaintext.
	createdHash string
	now         time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{
		users: map[uuid.UUID]*User{}, byEmail: map[string]uuid.UUID{},
		userRoles: map[uuid.UUID]map[uuid.UUID]bool{}, roles: map[uuid.UUID]*shared.Role{},
		byCode: map[string]uuid.UUID{}, rolePerms: map[uuid.UUID]map[string]bool{},
		permIDByCode: map[string]uuid.UUID{}, tfEnabled: map[uuid.UUID]bool{},
		sessions: map[uuid.UUID]*fakeSession{}, passwords: map[uuid.UUID]fakePassword{}, now: now,
	}
}

func (r *fakeRepo) ensurePerm(code string) uuid.UUID {
	if id, ok := r.permIDByCode[code]; ok {
		return id
	}
	id := uuid.New()
	r.permIDByCode[code] = id
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

func (r *fakeRepo) addUser(email, status string, roleIDs ...uuid.UUID) *User {
	u := &User{ID: uuid.New(), Email: email, FullName: "User " + email, Status: status, CreatedAt: r.now}
	r.users[u.ID] = u
	r.byEmail[strings.ToLower(email)] = u.ID
	r.userRoles[u.ID] = map[uuid.UUID]bool{}
	for _, rid := range roleIDs {
		r.userRoles[u.ID][rid] = true
	}
	return u
}

func (r *fakeRepo) addSession(userID uuid.UUID) uuid.UUID {
	id := uuid.New()
	r.sessions[id] = &fakeSession{userID: userID}
	return id
}

func (r *fakeRepo) roleSummary(rid uuid.UUID) shared.RoleSummary {
	role := r.roles[rid]
	return shared.RoleSummary{ID: rid, Code: role.Code, Name: role.Name}
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

// --- users.Repository ---

func (r *fakeRepo) GetUser(_ context.Context, id uuid.UUID) (*User, error) {
	u, ok := r.users[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (r *fakeRepo) GetUserByEmail(_ context.Context, email string) (*User, error) {
	id, ok := r.byEmail[strings.ToLower(email)]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *r.users[id]
	return &cp, nil
}

func (r *fakeRepo) ListUsers(_ context.Context, f ListUsersFilter) ([]User, int, error) {
	var out []User
	for _, u := range r.users {
		if f.Status != "" && u.Status != f.Status {
			continue
		}
		if f.Query != "" && !strings.Contains(u.Email, f.Query) && !strings.Contains(u.FullName, f.Query) {
			continue
		}
		if f.Role != "" && !r.hasRoleCode(u.ID, f.Role) {
			continue
		}
		out = append(out, *u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Email < out[j].Email })
	return out, len(out), nil
}

func (r *fakeRepo) CreateUser(_ context.Context, email, fullName, passwordHash string, roleIDs []uuid.UUID, _ uuid.UUID) (*User, error) {
	if _, ok := r.byEmail[strings.ToLower(email)]; ok {
		return nil, shared.ErrConflict
	}
	r.createdHash = passwordHash
	u := r.addUser(email, statusActive, roleIDs...)
	u.FullName = fullName
	cp := *u
	return &cp, nil
}

func (r *fakeRepo) hasRoleCode(userID uuid.UUID, code string) bool {
	for rid := range r.userRoles[userID] {
		if r.roles[rid].Code == code {
			return true
		}
	}
	return false
}

func (r *fakeRepo) SetPassword(_ context.Context, id uuid.UUID, passwordHash string, at time.Time) error {
	if _, ok := r.users[id]; !ok {
		return shared.ErrNotFound
	}
	r.passwords[id] = fakePassword{hash: passwordHash, at: at}
	for _, s := range r.sessions {
		if s.userID == id {
			s.revoked = true
		}
	}
	return nil
}

func (r *fakeRepo) HardDeleteUser(_ context.Context, id uuid.UUID) error {
	if u, ok := r.users[id]; ok {
		delete(r.byEmail, strings.ToLower(u.Email))
	}
	delete(r.users, id)
	delete(r.userRoles, id)
	return nil
}

func (r *fakeRepo) AssignRole(_ context.Context, userID, roleID, _ uuid.UUID) error {
	if r.userRoles[userID] == nil {
		r.userRoles[userID] = map[uuid.UUID]bool{}
	}
	r.userRoles[userID][roleID] = true
	return nil
}

func (r *fakeRepo) RemoveRole(_ context.Context, userID, roleID uuid.UUID) error {
	delete(r.userRoles[userID], roleID)
	return nil
}

func (r *fakeRepo) UpdateUserAtomic(_ context.Context, id uuid.UUID, fullName, status *string, revokeSessions bool, roleIDs *[]uuid.UUID, _ uuid.UUID, _ time.Time) error {
	u := r.users[id]
	if u == nil {
		return shared.ErrNotFound
	}
	if fullName != nil {
		u.FullName = *fullName
	}
	if status != nil {
		u.Status = *status
	}
	if revokeSessions {
		for _, s := range r.sessions {
			if s.userID == id {
				s.revoked = true
			}
		}
	}
	if roleIDs != nil {
		next := map[uuid.UUID]bool{}
		for _, rid := range *roleIDs {
			next[rid] = true
		}
		r.userRoles[id] = next
	}
	return nil
}

func (r *fakeRepo) RolesForUser(_ context.Context, userID uuid.UUID) ([]shared.RoleSummary, error) {
	var out []shared.RoleSummary
	for rid := range r.userRoles[userID] {
		out = append(out, r.roleSummary(rid))
	}
	return out, nil
}

func (r *fakeRepo) RolesForUsers(_ context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]shared.RoleSummary, error) {
	out := map[uuid.UUID][]shared.RoleSummary{}
	for _, uid := range userIDs {
		for rid := range r.userRoles[uid] {
			out[uid] = append(out[uid], r.roleSummary(rid))
		}
	}
	return out, nil
}

func (r *fakeRepo) TwoFactorEnabledForUsers(_ context.Context, userIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	for _, uid := range userIDs {
		if r.tfEnabled[uid] {
			out[uid] = true
		}
	}
	return out, nil
}

// --- reset sender fake ---

type fakeReset struct {
	sent []uuid.UUID
	err  error
}

func (f *fakeReset) SendResetLink(_ context.Context, userID uuid.UUID) error {
	f.sent = append(f.sent, userID)
	return f.err
}

// --- env ---

type tenv struct {
	svc   *Service
	repo  *fakeRepo
	reset *fakeReset
	clk   time.Time
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	reset := &fakeReset{}
	base := shared.NewBase(repo, reset, ratelimit.NewMemoryLimiter(func() time.Time { return clk }),
		storage.NewLocal(""), shared.Options{
			Now:    func() time.Time { return clk },
			Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		})
	return &tenv{svc: NewService(base, repo), repo: repo, reset: reset, clk: clk}
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
