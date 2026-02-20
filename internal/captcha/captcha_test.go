package captcha

import (
	"bytes"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

func newTestLogger(buf *bytes.Buffer) zerolog.Logger {
	return zerolog.New(buf)
}

func TestMockCAPTCHA_Send(t *testing.T) {
	var buf bytes.Buffer
	log := newTestLogger(&buf)
	ch := NewMock("+46701234567", "5", log)

	result := ch.Send()
	if !result {
		t.Error("Send() should return true")
	}
	if !strings.Contains(buf.String(), "+46701234567") {
		t.Error("Send() should log the caller_id")
	}
}

func TestMockCAPTCHA_Verify_Pass(t *testing.T) {
	var buf bytes.Buffer
	log := newTestLogger(&buf)
	ch := NewMock("+46701234567", "5", log)

	if !ch.Verify("5") {
		t.Error("Verify(\"5\") should return true when digit is 5")
	}
	if !strings.Contains(buf.String(), "CAPTCHA_PASS") {
		t.Error("expected CAPTCHA_PASS in log output")
	}
}

func TestMockCAPTCHA_Verify_Fail_WrongDigit(t *testing.T) {
	var buf bytes.Buffer
	log := newTestLogger(&buf)
	ch := NewMock("+46701234567", "5", log)

	if ch.Verify("3") {
		t.Error("Verify(\"3\") should return false when digit is 5")
	}
	if !strings.Contains(buf.String(), "CAPTCHA_FAIL") {
		t.Error("expected CAPTCHA_FAIL in log output")
	}
}

func TestMockCAPTCHA_Verify_Fail_Empty(t *testing.T) {
	var buf bytes.Buffer
	log := newTestLogger(&buf)
	ch := NewMock("+46701234567", "5", log)

	if ch.Verify("") {
		t.Error("Verify(\"\") should return false (no DTMF input)")
	}
	if !strings.Contains(buf.String(), "CAPTCHA_FAIL") {
		t.Error("expected CAPTCHA_FAIL in log output")
	}
}

func TestMockCAPTCHA_ImplementsInterface(t *testing.T) {
	var buf bytes.Buffer
	log := newTestLogger(&buf)
	var _ CAPTCHAChallenge = NewMock("+46701234567", "5", log)
}

func TestMockCAPTCHA_DifferentDigits(t *testing.T) {
	digits := []string{"0", "1", "5", "9"}
	for _, d := range digits {
		var buf bytes.Buffer
		log := newTestLogger(&buf)
		ch := NewMock("+46700000000", d, log)

		if !ch.Verify(d) {
			t.Errorf("Verify(%q) should pass when digit is %q", d, d)
		}
		wrongDigit := "0"
		if d == "0" {
			wrongDigit = "1"
		}
		var buf2 bytes.Buffer
		log2 := newTestLogger(&buf2)
		ch2 := NewMock("+46700000000", d, log2)
		if ch2.Verify(wrongDigit) {
			t.Errorf("Verify(%q) should fail when digit is %q", wrongDigit, d)
		}
	}
}
