package shared

import "github.com/velt/backend/internal/modules/settings"

// Setting keys for the assistant. The API key is a secret: it is stored
// AEAD-encrypted in system_settings, the same way mail.smtp_password is, and
// never lives in a file that could be committed.
const (
	GroupAI = "ai"

	KeyEnabled       = "ai.enabled"
	KeyProvider      = "ai.provider"
	KeyBaseURL       = "ai.base_url"
	KeyAPIKey        = "ai.api_key"
	KeyModel         = "ai.model"
	KeyMaxTurns      = "ai.max_turns"
	KeyDailyTokenCap = "ai.daily_token_cap"
	KeyMaxMessageLen = "ai.max_message_len"
	KeySystemPersona = "ai.system_persona"
)

// DefaultModel is the conversation model. Sonnet over Haiku for the Vietnamese
// nuance a consultative sales reply needs; over Opus because this is a short
// grounded answer, not a reasoning task.
const DefaultModel = "claude-sonnet-5-5"

// SettingDefs are the assistant's entries in the settings registry.
func SettingDefs() []settings.SettingDef {
	return []settings.SettingDef{
		{Key: KeyEnabled, Group: GroupAI, Type: settings.TypeBool, Default: false,
			Description: "Turn the AI assistant on. Off → the site falls back to the scripted bot"},
		// IsSecret is what drives encryption at rest and write-only exposure;
		// Type alone only describes the shape. Both are required — see
		// mail.smtp_password, which is the pattern this follows.
		{Key: KeyAPIKey, Group: GroupAI, Type: settings.TypeSecret, IsSecret: true, Default: "",
			Description: "Anthropic API key (stored encrypted)"},
		// anthropic | openai. "openai" is the OpenAI Chat Completions shape,
		// which also covers Ollama, LM Studio, vLLM, Groq and DeepSeek — a
		// local model is that adapter with a different base URL.
		{Key: KeyProvider, Group: GroupAI, Type: settings.TypeEnum,
			AllowedValues: []string{"anthropic", "openai"}, Default: "anthropic",
			Description: "LLM provider: anthropic | openai"},
		{Key: KeyBaseURL, Group: GroupAI, Type: settings.TypeString, Default: "",
			Description: "Endpoint base URL; empty → the provider's default (e.g. http://localhost:11434/v1 for Ollama)"},
		{Key: KeyModel, Group: GroupAI, Type: settings.TypeString, Default: DefaultModel,
			Description: "Conversation model id"},
		{Key: KeyMaxTurns, Group: GroupAI, Type: settings.TypeInt, Default: 30,
			Description: "Maximum visitor turns per conversation"},
		{Key: KeyDailyTokenCap, Group: GroupAI, Type: settings.TypeInt, Default: 2000000,
			Description: "Daily output-token ceiling; past it the assistant degrades to the scripted bot"},
		{Key: KeyMaxMessageLen, Group: GroupAI, Type: settings.TypeInt, Default: 2000,
			Description: "Maximum characters in one visitor message"},
		{Key: KeySystemPersona, Group: GroupAI, Type: settings.TypeString, Default: "",
			Description: "Extra persona text appended to the system prompt; empty → built-in only"},
	}
}
