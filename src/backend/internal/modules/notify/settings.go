package notify

import (
	"context"

	"github.com/velt/backend/internal/modules/settings"
)

// Group is where these land in the console. Their own group rather than a
// corner of "ai": two of the three have nothing to do with the assistant, and
// somebody looking for "why is my laptop pinging" should find one screen.
const Group = "notify"

// One switch per kind.
//
// Separate switches, not one master toggle, because the kinds differ by how
// often they fire and who cares. Somebody chasing leads wants lead_new and
// nothing else; being woken at 02:00 by a newsletter sign-up is how a person
// ends up turning notifications off entirely, which costs the alert that
// actually mattered.
const (
	KeyChatMessage    = "notify.push.chat_message"
	KeyLeadNew        = "notify.push.lead_new"
	KeyNewsletterNew  = "notify.push.newsletter_new"
	KeyVisitorWaiting = "notify.push.visitor_waiting"
)

// SettingsPort is the one question this module asks of settings.
type SettingsPort interface {
	GetBool(ctx context.Context, key string) bool
}

// enabled reports whether a kind should be delivered.
//
// An absent settings port means yes: a deployment that has not wired settings
// still has the behaviour it had before these switches existed, rather than
// silently going quiet.
func (s *Service) enabled(ctx context.Context, key string) bool {
	if s.settings == nil {
		return true
	}
	return s.settings.GetBool(ctx, key)
}

// SettingDefs are this module's entries in the settings registry.
//
// visitor_waiting defaults ON because it is the one that was already shipping
// and somebody is literally waiting. chat_message and lead_new default ON as
// the point of the feature. newsletter_new defaults OFF: it is the lowest-value
// of the four and the easiest to resent.
func SettingDefs() []settings.SettingDef {
	return []settings.SettingDef{
		{Key: KeyVisitorWaiting, Group: Group, Type: settings.TypeBool, Default: true,
			Description: "Desktop notification when a visitor asks for a person and nobody is online"},
		{Key: KeyChatMessage, Group: Group, Type: settings.TypeBool, Default: true,
			Description: "Desktop notification when a visitor opens a conversation (first message only)"},
		{Key: KeyLeadNew, Group: Group, Type: settings.TypeBool, Default: true,
			Description: "Desktop notification when the contact form is submitted"},
		{Key: KeyNewsletterNew, Group: Group, Type: settings.TypeBool, Default: false,
			Description: "Desktop notification when somebody subscribes to the newsletter"},
	}
}
