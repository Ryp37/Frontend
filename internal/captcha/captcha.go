package captcha

import "github.com/rs/zerolog"

type CAPTCHAChallenge interface {
	Send() bool
	Verify(input string) bool
}

type MockCAPTCHA struct {
	CallerID string
	Digit    string
	log      zerolog.Logger
}

func NewMock(callerID, digit string, log zerolog.Logger) *MockCAPTCHA {
	return &MockCAPTCHA{CallerID: callerID, Digit: digit, log: log}
}

func (m *MockCAPTCHA) Send() bool {
	m.log.Info().
		Str("caller_id", m.CallerID).
		Str("digit", m.Digit).
		Msgf("CAPTCHA sent to %s — press %s to continue", m.CallerID, m.Digit)
	return true
}

func (m *MockCAPTCHA) Verify(input string) bool {
	if input == m.Digit {
		m.log.Info().
			Str("caller_id", m.CallerID).
			Str("event", "CAPTCHA_PASS").
			Msg("CAPTCHA_PASS")
		return true
	}
	m.log.Warn().
		Str("caller_id", m.CallerID).
		Str("input", input).
		Str("event", "CAPTCHA_FAIL").
		Msg("CAPTCHA_FAIL")
	return false
}
