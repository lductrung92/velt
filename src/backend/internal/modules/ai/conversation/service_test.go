package conversation

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/modules/ai/tools"
)

func ctx() context.Context { return context.Background() }

const key = "visitor-key-0123456789"

func TestStartPersistsAGreeting(t *testing.T) {
	e := newEnv(t)
	res, err := e.svc.Start(ctx(), key, StartRequest{})
	require.NoError(t, err)
	require.Equal(t, StateBot, res.State)
	require.NotEmpty(t, res.Greeting)
	require.Nil(t, res.Referrer)

	msgs, _ := e.repo.History(ctx(), res.ID, 10)
	require.Len(t, msgs, 1)
	require.Equal(t, RoleAssistant, msgs[0].Role)
}

func TestReferralNamesTheIntroducer(t *testing.T) {
	e := newEnv(t)
	id := uuid.New()
	e.repo.members["an-nguyen"] = struct {
		id   uuid.UUID
		name string
	}{id, "An Nguyễn"}

	res, err := e.svc.Start(ctx(), key, StartRequest{Ref: "an-nguyen"})
	require.NoError(t, err)
	require.NotNil(t, res.Referrer)
	require.Equal(t, "An Nguyễn", res.Referrer.FullName)
	require.Contains(t, res.Greeting, "An Nguyễn")
}

func TestDeadReferralLinkIsIgnoredNotRefused(t *testing.T) {
	// A sharer's broken link is not the visitor's problem.
	e := newEnv(t)
	res, err := e.svc.Start(ctx(), key, StartRequest{Ref: "khong-ton-tai"})
	require.NoError(t, err)
	require.Nil(t, res.Referrer)
}

func TestStrangerCannotReadOrPost(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.Send(ctx(), "someone-else-entirely", res.ID, SendRequest{Content: "hi"})
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	// 404, not 403: confirming the conversation exists is itself a leak.
	require.Equal(t, 404, ae.Status)

	_, err = e.svc.Transcript(ctx(), "someone-else-entirely", res.ID)
	require.Error(t, err)
}

func TestDegradedFallsBackToTheScriptedBot(t *testing.T) {
	e := newEnv(t)
	e.settings.bools[shared.KeyEnabled] = false
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	out, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "Giá bao nhiêu?"})
	require.NoError(t, err, "a disabled assistant must not look like an outage")
	require.True(t, out.Degraded)

	msgs, _ := e.repo.History(ctx(), res.ID, 10)
	last := msgs[len(msgs)-1]
	require.Equal(t, RoleAssistant, last.Role)
	require.Contains(t, last.Content, "liên hệ", "the scripted reply should still route the visitor somewhere")
}

// The key now belongs to the endpoint, not to a setting: an endpoint with no
// credential is still a degraded assistant rather than an outage.
func TestNoAPIKeyIsDegradedNotAnError(t *testing.T) {
	e := newEnv(t)
	e.chain.apiKey = ""
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	out, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "xin chào"})
	require.NoError(t, err)
	require.True(t, out.Degraded)
}

func TestDailyBudgetCapDegrades(t *testing.T) {
	e := newEnv(t)
	e.settings.ints[shared.KeyDailyTokenCap] = 100
	e.repo.usageOut = 100 // exactly at the ceiling
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	out, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "xin chào"})
	require.NoError(t, err)
	require.True(t, out.Degraded, "over budget must degrade, never 5xx")
}

func TestTurnLimitStopsTheConversation(t *testing.T) {
	e := newEnv(t)
	e.settings.ints[shared.KeyMaxTurns] = 2
	e.settings.bools[shared.KeyEnabled] = false // stay off the network
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "một"})
	require.NoError(t, err)
	_, err = e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "hai"})
	require.NoError(t, err)

	_, err = e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "ba"})
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 429, ae.Status)
}

func TestClosedConversationRefusesWrites(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	require.NoError(t, e.repo.SetState(ctx(), res.ID, StateClosed))

	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "còn ai không"})
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 409, ae.Status)
}

func TestAssistantStaysSilentOnceAHumanOwnsIt(t *testing.T) {
	// THE invariant. A visitor message in a human-owned conversation is still
	// recorded and fanned out — that is how the person who took over sees it —
	// but the assistant must not answer it.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	require.NoError(t, e.repo.SetState(ctx(), res.ID, StateHuman))

	events, unsub := e.hub.Subscribe(res.ID)
	defer unsub()

	out, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "cho tôi hỏi thêm"})
	require.NoError(t, err)
	require.True(t, out.Accepted)

	got := collect(events, 250*time.Millisecond)
	require.Len(t, got, 1, "only the visitor's own message should be published")
	require.Equal(t, EventMessage, got[0].Type)
	require.Equal(t, RoleVisitor, got[0].Message.Role)

	msgs, _ := e.repo.History(ctx(), res.ID, 10)
	for _, m := range msgs[1:] { // skip the greeting
		require.NotEqual(t, RoleAssistant, m.Role, "the assistant answered while a human owned the chat")
	}
}

func TestWaitingAlsoSilencesTheAssistant(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	require.NoError(t, e.repo.SetState(ctx(), res.ID, StateWaiting))

	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "có ai không"})
	require.NoError(t, err)

	msgs, _ := e.repo.History(ctx(), res.ID, 10)
	for _, m := range msgs[1:] {
		require.NotEqual(t, RoleAssistant, m.Role)
	}
}

func TestSpeakingIsOnlyTrueInBotState(t *testing.T) {
	for state, want := range map[string]bool{
		StateBot: true, StateWaiting: false, StateHuman: false, StateClosed: false,
	} {
		require.Equal(t, want, Conversation{State: state}.Speaking(), "state %s", state)
	}
}

func TestEmptyMessageRejected(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "   "})
	require.Error(t, err)
}

func TestOverlongMessageIsTruncatedNotRejected(t *testing.T) {
	e := newEnv(t)
	e.settings.ints[shared.KeyMaxMessageLen] = 20
	e.settings.bools[shared.KeyEnabled] = false
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: strings.Repeat("a", 500)})
	require.NoError(t, err)

	msgs, _ := e.repo.History(ctx(), res.ID, 10)
	var visitor Message
	for _, m := range msgs {
		if m.Role == RoleVisitor {
			visitor = m
		}
	}
	require.Len(t, visitor.Content, 20)
}

func TestTranscriptKeepsSystemAnnouncements(t *testing.T) {
	// They are visitor-facing ("a member has joined"), so they must survive a
	// reload rather than vanishing after being read live.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	_, _ = e.repo.AddMessage(ctx(), Message{
		ConversationID: res.ID, Role: RoleSystem,
		Content: "Một thành viên đã tham gia cuộc trò chuyện.",
	})

	rows, err := e.svc.Transcript(ctx(), key, res.ID)
	require.NoError(t, err)
	found := false
	for _, r := range rows {
		if r.Role == RoleSystem {
			found = true
		}
	}
	require.True(t, found)
}

func TestSystemPromptNamesOnlyPublishedProducts(t *testing.T) {
	e := newEnv(t)
	e.catalog.items = []tools.CatalogItem{
		{Slug: "bang-cong-viec", Name: "Bảng công việc", Summary: "Sắp xếp công việc"},
	}
	got := buildSystem(ctx(), e.catalog, "", "vi")
	require.Contains(t, got, "bang-cong-viec")
	require.Contains(t, got, "KHÔNG nói về giá")
}

func TestSystemPromptAdmitsAnEmptyCatalog(t *testing.T) {
	// Saying "nothing is published yet" beats letting the model improvise.
	e := newEnv(t)
	got := buildSystem(ctx(), e.catalog, "", "vi")
	require.Contains(t, got, "chưa có sản phẩm nào được công bố")
}

func TestPersonaIsAppendedNotSubstituted(t *testing.T) {
	e := newEnv(t)
	got := buildSystem(ctx(), e.catalog, "Xưng hô là 'bên mình'.", "vi")
	require.Contains(t, got, "Xưng hô là 'bên mình'.")
	require.Contains(t, got, "KHÔNG nói về giá", "operator text must not be able to drop the constraints")
}

func TestScriptedReplyNeverQuotesAPrice(t *testing.T) {
	for _, q := range []string{
		"giá bao nhiêu", "báo giá cho tôi", "chi phí thế nào",
		"demo ở đâu", "cho gặp nhân viên", "có sản phẩm gì", "asdfgh",
	} {
		got := scriptedReply(q, "vi")
		require.NotEmpty(t, got)
		require.NotRegexp(t, `[0-9][0-9.,]*\s*(đ|vnd|k/|triệu)`, strings.ToLower(got))
	}
}

func TestDeltaGuardStopsMidAnswerWhenAHumanTakesOver(t *testing.T) {
	// The expensive case: the assistant is already streaming when a member
	// claims the conversation. Every fragment is gated, so it stops on the
	// very next one instead of finishing its sentence over a person.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	events, unsub := e.hub.Subscribe(res.ID)
	defer unsub()

	emit := e.svc.deltaGuard(ctx(), res.ID)

	require.NoError(t, emit("Chào "))
	require.NoError(t, emit("bạn, "))

	// A member picks it up right here, mid-sentence.
	require.NoError(t, e.repo.SetState(ctx(), res.ID, StateHuman))

	require.ErrorIs(t, emit("sản phẩm này"), errTookOver)
	require.ErrorIs(t, emit("còn nữa..."), errTookOver)

	got := collect(events, 200*time.Millisecond)
	var deltas []string
	for _, ev := range got {
		if ev.Type == EventDelta {
			deltas = append(deltas, ev.Text)
		}
	}
	require.Equal(t, []string{"Chào ", "bạn, "}, deltas,
		"nothing may be published after the handover")
}

func TestDeltaGuardStopsOnAVanishedConversation(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	emit := e.svc.deltaGuard(ctx(), res.ID)
	require.NoError(t, emit("xin chào"))

	delete(e.repo.convs, res.ID)
	require.ErrorIs(t, emit("tiếp tục"), errTookOver)
}
