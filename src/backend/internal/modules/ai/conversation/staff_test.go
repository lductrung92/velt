package conversation

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

func staff() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permHandle}}
}

func outsider() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{}}
}

func TestOnlyHandlersSeeTheInbox(t *testing.T) {
	// A transcript is a customer conversation, so reading one is gated even
	// though starting one needs no account at all.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.Inbox(ctx(), outsider(), "", 10)
	require.Error(t, err)
	_, err = e.svc.StaffTranscript(ctx(), outsider(), res.ID)
	require.Error(t, err)
	require.Error(t, e.svc.Claim(ctx(), outsider(), res.ID))
	_, err = e.svc.StaffReply(ctx(), outsider(), res.ID, StaffMessageRequest{Content: "hi"})
	require.Error(t, err)
}

func TestClaimHasExactlyOneWinner(t *testing.T) {
	// Two people pressing the button at the same moment is the whole reason
	// this is one conditional UPDATE. The loser must be told, because two
	// people answering one customer without knowing is worse than a conflict.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	first, second := staff(), staff()
	require.NoError(t, e.svc.Claim(ctx(), first, res.ID))

	err := e.svc.Claim(ctx(), second, res.ID)
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 409, ae.Status)

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.Equal(t, StateHuman, conv.State)
	require.Equal(t, first.UserID, *conv.ClaimedByUserID)
}

func TestClaimSilencesTheAssistantAndAnnouncesIt(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	events, unsub := e.hub.Subscribe(res.ID)
	defer unsub()

	require.NoError(t, e.svc.Claim(ctx(), staff(), res.ID))

	got := collect(events, 250*time.Millisecond)
	var sawState bool
	var sawNote bool
	for _, ev := range got {
		if ev.Type == EventState && ev.State == StateHuman {
			sawState = true
		}
		if ev.Type == EventMessage && ev.Message.Role == RoleSystem {
			sawNote = true
		}
	}
	require.True(t, sawState, "the client needs a state event to stop waiting on the assistant")
	require.True(t, sawNote, "the visitor should be told a person joined")

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.False(t, conv.Speaking())
}

func TestReleaseGivesItBackToTheAssistant(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	member := staff()
	require.NoError(t, e.svc.Claim(ctx(), member, res.ID))
	require.NoError(t, e.svc.Release(ctx(), member, res.ID))

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.Equal(t, StateBot, conv.State)
	require.Nil(t, conv.ClaimedByUserID)
	require.True(t, conv.Speaking())
}

func TestAColleagueCanAnswerWithoutHavingClaimedIt(t *testing.T) {
	// In a small team someone covering for a person at lunch is normal.
	// Blocking that would be a rule nobody asked for; the author is recorded
	// either way.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	owner, colleague := staff(), staff()
	require.NoError(t, e.svc.Claim(ctx(), owner, res.ID))

	msg, err := e.svc.StaffReply(ctx(), colleague, res.ID,
		StaffMessageRequest{Content: "Mình trả lời giúp bạn ấy nhé"})
	require.NoError(t, err)
	require.Equal(t, RoleStaff, msg.Role)

	rows, _ := e.repo.History(ctx(), res.ID, 10)
	last := rows[len(rows)-1]
	require.Equal(t, colleague.UserID, *last.AuthorUserID, "the real author is recorded")
}

func TestStaffReplyReachesTheVisitorStream(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	member := staff()
	require.NoError(t, e.svc.Claim(ctx(), member, res.ID))

	events, unsub := e.hub.Subscribe(res.ID)
	defer unsub()

	_, err := e.svc.StaffReply(ctx(), member, res.ID, StaffMessageRequest{Content: "Chào bạn"})
	require.NoError(t, err)

	got := collect(events, 250*time.Millisecond)
	require.NotEmpty(t, got)
	require.Equal(t, RoleStaff, got[0].Message.Role)
	require.Equal(t, "Chào bạn", got[0].Message.Content)
}

func TestCannotReplyIntoAClosedConversation(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	member := staff()
	require.NoError(t, e.svc.Close(ctx(), member, res.ID))

	_, err := e.svc.StaffReply(ctx(), member, res.ID, StaffMessageRequest{Content: "còn đó không"})
	require.Error(t, err)
}

func TestHandoffRefusesWhenNobodyIsOnDuty(t *testing.T) {
	// Parking a visitor in a queue that will not move is worse than saying the
	// office is empty — and the conversation stays with the assistant, which
	// can still take their contact details.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.RequestHuman(ctx(), key, res.ID)
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 409, ae.Status)

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.Equal(t, StateBot, conv.State, "the assistant keeps the conversation")
}

func TestHandoffQueuesWhenSomeoneIsOnDuty(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	member := staff()
	_, err := e.svc.Beat(ctx(), member)
	require.NoError(t, err)

	state, err := e.svc.RequestHuman(ctx(), key, res.ID)
	require.NoError(t, err)
	require.Equal(t, StateWaiting, state)

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.False(t, conv.Speaking(), "the assistant must go quiet while the visitor waits")
}

func TestHandoffRefusesAStranger(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	_, _ = e.svc.Beat(ctx(), staff())

	_, err := e.svc.RequestHuman(ctx(), "another-browser-key-xx", res.ID)
	require.Error(t, err)
}

func TestInboxShowsTheLatestLineAndHidesClosed(t *testing.T) {
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	e.settings.bools["ai.enabled"] = false
	_, _ = e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "cho hỏi về demo"})

	rows, err := e.svc.Inbox(ctx(), staff(), "", 10)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.NotNil(t, rows[0].LastMessage)
	require.Greater(t, rows[0].MessageCount, 1)

	require.NoError(t, e.svc.Close(ctx(), staff(), res.ID))
	rows, err = e.svc.Inbox(ctx(), staff(), "", 10)
	require.NoError(t, err)
	require.Empty(t, rows, "a closed conversation drops out of the live inbox")
}

func TestPresenceExpires(t *testing.T) {
	// A closed laptop never sends a goodbye, so duty has to lapse on its own.
	p := NewPresence()
	now := time.Now()
	p.now = func() time.Time { return now }

	id := uuid.New()
	p.Beat(id)
	require.True(t, p.AnyOnline())
	require.Equal(t, 1, p.Count())

	now = now.Add(presenceTTL + time.Second)
	require.False(t, p.AnyOnline())
	require.Equal(t, 0, p.Count())
}

func TestPresenceLeaveIsImmediate(t *testing.T) {
	p := NewPresence()
	id := uuid.New()
	p.Beat(id)
	p.Leave(id)
	require.False(t, p.AnyOnline())
}

func TestHandoffParksTheVisitorWhenADeviceCanBeRung(t *testing.T) {
	// The office being empty is only a dead end when nobody can be told. With
	// a notification device registered the visitor is parked for a person —
	// that is the whole point of desktop notifications.
	e := newEnv(t)
	e.notify.recipient = true
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	state, err := e.svc.RequestHuman(ctx(), key, res.ID)
	require.NoError(t, err)
	require.Equal(t, StateWaiting, state)
	require.Equal(t, []uuid.UUID{res.ID}, e.notify.rung)

	conv, _ := e.repo.Get(ctx(), res.ID)
	require.Equal(t, StateWaiting, conv.State)
}

func TestHandoffStillRefusesWhenNoDeviceIsRegistered(t *testing.T) {
	// Guards the other half: a deployment with nobody subscribed must keep the
	// honest refusal rather than queue for a person who will never hear.
	e := newEnv(t)
	e.notify.recipient = false
	res, _ := e.svc.Start(ctx(), key, StartRequest{})

	_, err := e.svc.RequestHuman(ctx(), key, res.ID)
	require.Error(t, err)
	require.Empty(t, e.notify.rung)
}

func TestVisitorMessageRingsOnlyWhenAPersonOwnsTheConversation(t *testing.T) {
	// While the assistant is answering there is nothing for a person to do, so
	// a notification would be noise. Once a person owns the thread, every
	// visitor line is something somebody has to see.
	e := newEnv(t)
	e.notify.recipient = true
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	e.settings.bools["ai.enabled"] = false

	_, err := e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "cho hỏi giá"})
	require.NoError(t, err)
	require.Empty(t, e.notify.rung, "the assistant is handling it")

	_, _ = e.svc.Beat(ctx(), staff())
	_, err = e.svc.RequestHuman(ctx(), key, res.ID)
	require.NoError(t, err)
	e.presence.Leave(staff().UserID)

	_, err = e.svc.Send(ctx(), key, res.ID, SendRequest{Content: "còn ai không ạ"})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{res.ID}, e.notify.rung)
}

func TestTheQueueHearsAboutEveryConversationOnOneSubscription(t *testing.T) {
	// One connection per operator instead of a five-second poll. The queue
	// subscribes to nothing in particular, so a conversation it has never seen
	// has to reach it too — that is the case a per-conversation topic misses.
	e := newEnv(t)
	events, stop := e.svc.Hub().SubscribeInbox()
	defer stop()

	res, err := e.svc.Start(ctx(), key, StartRequest{})
	require.NoError(t, err)

	select {
	case ev := <-events:
		require.Equal(t, EventInbox, ev.Type)
		require.Equal(t, res.ID.String(), ev.ConversationID)
	case <-time.After(time.Second):
		t.Fatal("a new conversation never reached the queue")
	}
}

func TestTheQueueIsNotWokenByEveryStreamedFragment(t *testing.T) {
	// The queue shows a last line and a state, neither of which changes token
	// by token. Refetching the inbox per fragment would cost more than the
	// polling this replaces.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	events, stop := e.svc.Hub().SubscribeInbox()
	defer stop()

	e.svc.fanOut(res.ID, Event{Type: EventDelta, Text: "đang gõ"})
	select {
	case ev := <-events:
		t.Fatalf("a delta woke the queue: %+v", ev)
	case <-time.After(150 * time.Millisecond):
	}

	// A finished line is a different matter: that is what the queue shows.
	e.svc.fanOut(res.ID, Event{Type: EventMessage})
	select {
	case ev := <-events:
		require.Equal(t, EventInbox, ev.Type)
	case <-time.After(time.Second):
		t.Fatal("a finished message never reached the queue")
	}
}

func TestStaffActionsReachTheQueue(t *testing.T) {
	// Claim/release/close all go through announce; this is the guard that they
	// keep doing so, because the console stops polling once this ships.
	e := newEnv(t)
	res, _ := e.svc.Start(ctx(), key, StartRequest{})
	member := staff()
	_, _ = e.svc.Beat(ctx(), member)
	_, _ = e.svc.RequestHuman(ctx(), key, res.ID)

	events, stop := e.svc.Hub().SubscribeInbox()
	defer stop()
	require.NoError(t, e.svc.Claim(ctx(), member, res.ID))

	select {
	case ev := <-events:
		require.Equal(t, res.ID.String(), ev.ConversationID)
	case <-time.After(time.Second):
		t.Fatal("claiming a conversation never reached the queue")
	}
}
