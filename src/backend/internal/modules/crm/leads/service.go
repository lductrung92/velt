package leads

import (
	"context"
	"net/mail"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/crm/shared"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// Service is the leads use-case layer.
type Service struct {
	*shared.Base
	repo Repository
	// notify rings the people who chase leads. Optional: a deployment with
	// nobody subscribed leaves it nil and nothing changes.
	notify NotifyPort
}

// NotifyPort is the one thing this module asks of the notification stack.
//
// An interface rather than the service itself so a lead can be captured in a
// test with no push infrastructure, and so this module does not depend on
// how a notification is delivered.
type NotifyPort interface {
	LeadCreated(ctx context.Context, leadID uuid.UUID)
}

// SetNotifier supplies the notification sink.
func (s *Service) SetNotifier(n NotifyPort) { s.notify = n }

// NewService builds the leads service.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// --- Reads ---

// List returns a page of leads. Requires crm.leads.view.
//
// Without crm.leads.view_all the caller is held to the queue they are entitled
// to: their own leads and the unassigned pile. That scoping is not implemented
// yet because members and users are still unlinked (OVERVIEW §7) — until then
// this endpoint deliberately requires the wider permission.
func (s *Service) List(ctx context.Context, id *httpx.Identity, p ListParams) (ListResponse, error) {
	if err := s.Require(ctx, id, permViewAll); err != nil {
		return ListResponse{}, err
	}
	p = normalize(p)
	rows, total, err := s.repo.List(ctx, p)
	if err != nil {
		return ListResponse{}, s.MapRepoErr(ctx, "list leads", err)
	}
	items := make([]Response, 0, len(rows))
	for _, l := range rows {
		res, err := s.decorate(ctx, *l)
		if err != nil {
			return ListResponse{}, err
		}
		items = append(items, res)
	}
	return ListResponse{Items: items, Total: total, Page: p.Page, PageSize: p.PageSize}, nil
}

// Get returns one lead. Requires crm.leads.view.
func (s *Service) Get(ctx context.Context, id *httpx.Identity, leadID uuid.UUID) (Response, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return Response{}, err
	}
	l, err := s.repo.Get(ctx, leadID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "get lead", err)
	}
	return s.decorate(ctx, *l)
}

// --- Writes ---

// Create records a new lead. Requires crm.leads.manage.
func (s *Service) Create(ctx context.Context, id *httpx.Identity, req CreateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	w := write{
		Name:             trimPtr(req.Name),
		Email:            trimPtr(req.Email),
		Phone:            trimPtr(req.Phone),
		Zalo:             trimPtr(req.Zalo),
		Source:           SourceManual,
		ConversationID:   req.ConversationID,
		AssignedMemberID: req.AssignedMemberID,
		Status:           StatusNew,
		Note:             trimPtr(req.Note),
	}
	if req.Source != nil {
		if !validSources[*req.Source] {
			return Response{}, apperr.Validation(map[string]string{"source": "invalid"})
		}
		w.Source = *req.Source
	}
	if req.Status != nil {
		if !validStatuses[*req.Status] {
			return Response{}, apperr.Validation(map[string]string{"status": "invalid"})
		}
		w.Status = *req.Status
	}
	if err := validateContact(w); err != nil {
		return Response{}, err
	}

	l, err := s.repo.Create(ctx, w, req.ProductIDs)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "create lead", err)
	}
	s.Record(ctx, id, leadEntry(actionCreated, l.ID, leadLabel(l),
		map[string]any{"source": l.Source, "status": l.Status}))
	return s.decorate(ctx, *l)
}

// Update applies a PATCH. Requires crm.leads.manage.
func (s *Service) Update(ctx context.Context, id *httpx.Identity, leadID uuid.UUID, req UpdateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.Get(ctx, leadID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update lead: load", err)
	}

	w := write{
		Name:             cur.Name,
		Email:            cur.Email,
		Phone:            cur.Phone,
		Zalo:             cur.Zalo,
		Source:           cur.Source,
		ConversationID:   cur.ConversationID,
		AssignedMemberID: cur.AssignedMemberID,
		Status:           cur.Status,
		Note:             cur.Note,
	}
	// Absent → keep. Present → set, where an empty string clears.
	if req.Name != nil {
		w.Name = trimPtr(req.Name)
	}
	if req.Email != nil {
		w.Email = trimPtr(req.Email)
	}
	if req.Phone != nil {
		w.Phone = trimPtr(req.Phone)
	}
	if req.Zalo != nil {
		w.Zalo = trimPtr(req.Zalo)
	}
	if req.Note != nil {
		w.Note = trimPtr(req.Note)
	}
	if req.Status != nil {
		if !validStatuses[*req.Status] {
			return Response{}, apperr.Validation(map[string]string{"status": "invalid"})
		}
		w.Status = *req.Status
	}
	// Assignment needs three outcomes from two JSON states, hence the flag.
	switch {
	case req.ClearAssignee:
		w.AssignedMemberID = nil
	case req.AssignedMemberID != nil:
		w.AssignedMemberID = req.AssignedMemberID
	}
	if err := validateContact(w); err != nil {
		return Response{}, err
	}

	l, err := s.repo.Update(ctx, leadID, w, req.ProductIDs, req.ProductIDs != nil)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "update lead", err)
	}
	// Where a lead got to is the point of the pipeline, so a status move is the
	// one thing the row carries beyond "edited".
	var meta map[string]any
	if cur.Status != l.Status {
		meta = map[string]any{"from": cur.Status, "to": l.Status}
	}
	s.Record(ctx, id, leadEntry(actionUpdated, leadID, leadLabel(l), meta))
	return s.decorate(ctx, *l)
}

// Delete removes a lead for good. Requires crm.leads.manage.
//
// There is no archive state: `lost` is how a lead that went nowhere is recorded,
// so an actual delete only ever means "this row should not have existed".
func (s *Service) Delete(ctx context.Context, id *httpx.Identity, leadID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	// Read before the delete: a lead deleted as one that should not have existed
	// still has to be identifiable afterwards.
	cur, err := s.repo.Get(ctx, leadID)
	if err != nil {
		return s.MapRepoErr(ctx, "delete lead: load", err)
	}
	if err := s.repo.Delete(ctx, leadID); err != nil {
		return s.MapRepoErr(ctx, "delete lead", err)
	}
	s.Record(ctx, id, leadEntry(actionDeleted, leadID, leadLabel(cur),
		map[string]any{"source": cur.Source, "status": cur.Status}))
	return nil
}

// CaptureFromChat records a lead the assistant collected. There is no identity:
// the caller is the ai module acting for an anonymous visitor, so this is NOT
// permission-gated and is deliberately the only unauthenticated way in.
//
// It is the single write the site-facing assistant is allowed to perform. Keep
// it that way: the whole prompt-injection defence rests on the assistant having
// nothing else it can do.
func (s *Service) CaptureFromChat(ctx context.Context, req CreateRequest) (Response, error) {
	w := write{
		Name:             trimPtr(req.Name),
		Email:            trimPtr(req.Email),
		Phone:            trimPtr(req.Phone),
		Zalo:             trimPtr(req.Zalo),
		Source:           SourceChat,
		ConversationID:   req.ConversationID,
		AssignedMemberID: req.AssignedMemberID, // the ?ref= member, when there was one
		Status:           StatusNew,
		Note:             trimPtr(req.Note),
	}
	if err := validateContact(w); err != nil {
		return Response{}, err
	}
	l, err := s.repo.Create(ctx, w, req.ProductIDs)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "capture lead", err)
	}
	return s.decorate(ctx, *l)
}

// --- Helpers ---

func normalize(p ListParams) ListParams {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = defaultPageSize
	}
	if p.PageSize > maxPageSize {
		p.PageSize = maxPageSize
	}
	p.Query = strings.TrimSpace(p.Query)
	return p
}

// validateContact enforces reachability and checks the email format here rather
// than with a struct tag — see the note on CreateRequest.
func validateContact(w write) error {
	if w.Email != nil {
		if _, err := mail.ParseAddress(*w.Email); err != nil {
			return apperr.Validation(map[string]string{"email": "invalid"})
		}
	}
	if w.Email == nil && w.Phone == nil && w.Zalo == nil {
		return apperr.Validation(map[string]string{"contact": "required"})
	}
	return nil
}

// decorate fills in the relations every single-lead reply carries.
func (s *Service) decorate(ctx context.Context, l Lead) (Response, error) {
	products, err := s.repo.ProductsOf(ctx, l.ID)
	if err != nil {
		return Response{}, s.MapRepoErr(ctx, "decorate lead: products", err)
	}
	var assignee *MemberRef
	if l.AssignedMemberID != nil {
		assignee, err = s.repo.AssigneeOf(ctx, *l.AssignedMemberID)
		if err != nil {
			return Response{}, s.MapRepoErr(ctx, "decorate lead: assignee", err)
		}
	}
	return Response{
		ID: l.ID, Name: l.Name, Email: l.Email, Phone: l.Phone, Zalo: l.Zalo,
		Source: l.Source, ConversationID: l.ConversationID,
		Assignee: assignee, Status: l.Status, Note: l.Note,
		Products:  products,
		CreatedAt: l.CreatedAt, UpdatedAt: l.UpdatedAt,
	}, nil
}

// trimPtr trims a pointer string and collapses an empty result to nil, which is
// how the console clears an optional field.
func trimPtr(in *string) *string {
	if in == nil {
		return nil
	}
	v := strings.TrimSpace(*in)
	if v == "" {
		return nil
	}
	return &v
}

// FormCapture is what the public contact form may set. The server decides the
// rest: source is always `form`, status always `new`.
type FormCapture struct {
	Name             string
	Email            string
	Note             string
	AssignedMemberID *uuid.UUID
	ProductIDs       []uuid.UUID
}

// CaptureFromForm records a lead the site's contact form collected.
//
// The second unauthenticated write in this module, alongside CaptureFromChat,
// and held to the same rule: the caller supplies contact details and nothing
// that decides how the lead is handled. Source and status are set here, not
// taken from the request, so no submission can arrive pre-assigned a state the
// pipeline reads as progress.
func (s *Service) CaptureFromForm(ctx context.Context, in FormCapture) error {
	w := write{
		Name:             trimPtr(&in.Name),
		Email:            trimPtr(&in.Email),
		Source:           SourceForm,
		AssignedMemberID: in.AssignedMemberID,
		Status:           StatusNew,
		Note:             trimPtr(&in.Note),
	}
	if err := validateContact(w); err != nil {
		return err
	}
	created, err := s.repo.Create(ctx, w, in.ProductIDs)
	if err != nil {
		return s.MapRepoErr(ctx, "capture form lead", err)
	}
	// After the row exists, never before: a notification about a lead that
	// failed to save would send somebody looking for nothing.
	if s.notify != nil {
		s.notify.LeadCreated(ctx, created.ID)
	}
	return nil
}
