// Package notify delivers desktop notifications to the people on chat duty.
//
// Web Push with VAPID, not a vendor SDK: Chrome, Firefox and Safari each run
// their own push service, and one self-signed key pair reaches all three. The
// console registers a browser; the server pushes to it when a visitor needs a
// human and nobody is at the desk.
//
// What travels is deliberately thin — a conversation id and a kind, never the
// visitor's words. A push payload lands on third-party infrastructure and on a
// lock screen; the console fetches the content afterwards, authenticated.
package notify

import (
	"time"

	"github.com/google/uuid"
)

// Subscription is one browser install signed up for notifications.
type Subscription struct {
	ID uuid.UUID `json:"id"`
	// Endpoint is sent back so the console can tell which row is the browser
	// it is running in — nothing else can tell them apart. It is the owner's
	// own data behind their own session, and on its own it is not enough to
	// push with: a payload has to be encrypted with the p256dh/auth pair,
	// which never leaves the server.
	Endpoint   string     `json:"endpoint"`
	Label      string     `json:"label"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// subscription carries what the push library needs, which never leaves here.
type subscription struct {
	ID       uuid.UUID
	UserID   uuid.UUID
	Endpoint string
	P256dh   string
	Auth     string
}

// SubscribeRequest is the console registering this browser.
type SubscribeRequest struct {
	Endpoint string `json:"endpoint" validate:"required,max=600"`
	P256dh   string `json:"p256dh" validate:"required,max=200"`
	Auth     string `json:"auth" validate:"required,max=100"`
	Label    string `json:"label" validate:"omitempty,max=80"`
}

// SubscriptionsResponse is the device list the console shows.
type SubscriptionsResponse struct {
	Items []Subscription `json:"items"`
}

// PublicKeyResponse hands the console the VAPID public key it must pass to
// pushManager.subscribe().
type PublicKeyResponse struct {
	PublicKey string `json:"public_key"`
}

// payload is the notification body. Kept to identifiers on purpose — see the
// package comment.
//
// EntityID is whatever the kind points at: a lead, a subscriber. The
// conversation keeps its own field because the service worker has always sent
// it and an older worker still installed in somebody's browser would stop
// recognising its own notifications if it moved.
type payload struct {
	Kind           string `json:"kind"`
	ConversationID string `json:"conversation_id,omitempty"`
	EntityID       string `json:"entity_id,omitempty"`
}

// The kinds of thing worth interrupting somebody for.
//
// Each goes to the people who can act on it, which is not the same set: the
// person answering chats is not necessarily the person chasing leads. See
// recipientPerm.
const (
	// KindVisitorWaiting: somebody asked for a human and nobody is online.
	KindVisitorWaiting = "visitor_waiting"
	// KindChatMessage: a visitor opened a conversation. Only the first
	// message of each one — see Service.ChatMessage.
	KindChatMessage = "chat_message"
	// KindLeadNew: the contact form was submitted.
	KindLeadNew = "lead_new"
	// KindNewsletterNew: somebody subscribed to the newsletter.
	KindNewsletterNew = "newsletter_new"
)
