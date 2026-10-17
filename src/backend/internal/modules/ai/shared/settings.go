package shared

import "github.com/velt/backend/internal/modules/settings"

// Setting keys for the assistant.
//
// The endpoint itself — adapter, URL, key, model — is NOT here: it is a record
// in ai_providers / ai_purpose_models, because there can be several and each
// job runs an ordered chain of them. See migration 0049. What is left are the
// knobs that apply however the assistant is wired.
const (
	GroupAI = "ai"

	KeyEnabled       = "ai.enabled"
	KeyMaxTurns      = "ai.max_turns"
	KeyDailyTokenCap = "ai.daily_token_cap"
	KeyMaxMessageLen = "ai.max_message_len"
	KeySystemPersona = "ai.system_persona"

	// Abuse controls for the public chatbot. Separate from the endpoint and
	// from the global reCAPTCHA switch: the contact form and the chat are
	// attacked differently and an operator may want one guarded and not the
	// other.
	KeyChatRequireCaptcha = "ai.chat.require_captcha"
	KeyChatMaxPerDay      = "ai.chat.max_per_day"
)

// SettingDefs are the assistant's entries in the settings registry.
func SettingDefs() []settings.SettingDef {
	return []settings.SettingDef{
		{Key: KeyEnabled, Group: GroupAI, Type: settings.TypeBool, Default: false,
			Description: "Turn the AI assistant on. Off → the site falls back to the scripted bot"},
		{Key: KeyMaxTurns, Group: GroupAI, Type: settings.TypeInt, Default: 30,
			Description: "Maximum visitor turns per conversation"},
		{Key: KeyDailyTokenCap, Group: GroupAI, Type: settings.TypeInt, Default: 2000000,
			Description: "Daily output-token ceiling; past it the assistant degrades to the scripted bot"},
		{Key: KeyMaxMessageLen, Group: GroupAI, Type: settings.TypeInt, Default: 2000,
			Description: "Maximum characters in one visitor message"},
		{Key: KeySystemPersona, Group: GroupAI, Type: settings.TypeString, Default: "",
			Description: "Extra persona text appended to the system prompt; empty → built-in only"},
		// Public because the site has to know before it writes: it must fetch
		// a token and send it with the very first message, and there is no
		// second chance to ask. Publishing the flag reveals that the chat is
		// guarded, which is not a secret — the challenge itself is visible.
		{Key: KeyChatRequireCaptcha, Group: GroupAI, Type: settings.TypeBool, Default: false, IsPublic: true,
			Description: "Require reCAPTCHA on the first message of a conversation. Needs the site key and secret under Security; without them it does nothing"},
		{Key: KeyChatMaxPerDay, Group: GroupAI, Type: settings.TypeInt, Default: 20,
			Description: "Maximum conversations one visitor may open per day; 0 → no limit"},
	}
}

// Purpose names one job the assistant does. Each may run on its own model.
//
// Two, not one per feature: the thing that actually differs is the
// REQUIREMENT. The chatbot answers a visitor live and must call tools or it
// invents products; translating and drafting are offline text generation a
// human reviews. Splitting further would be settings nobody has a reason to
// set differently.
type Purpose string

const (
	PurposeChat    Purpose = "chat"
	PurposeContent Purpose = "content"
)
