package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	RedisURL          string
	SIPPort           int
	APIPort           int
	AuditMode         bool
	GreenThreshold    int
	RedThreshold      int
	LogLevel          string
	GinMode           string
	CaptchaDigit      int
	CaptchaTimeoutSec int
	GreylistTTLSec    int
}

func Load() (*Config, error) {
	sipPort, err := parseInt("SIP_PORT", 5060)
	if err != nil {
		return nil, fmt.Errorf("invalid SIP_PORT: %w", err)
	}
	apiPort, err := parseInt("API_PORT", 8080)
	if err != nil {
		return nil, fmt.Errorf("invalid API_PORT: %w", err)
	}
	greenThreshold, err := parseInt("GREEN_THRESHOLD", 10)
	if err != nil {
		return nil, fmt.Errorf("invalid GREEN_THRESHOLD: %w", err)
	}
	redThreshold, err := parseInt("RED_THRESHOLD", 50)
	if err != nil {
		return nil, fmt.Errorf("invalid RED_THRESHOLD: %w", err)
	}
	auditMode, err := parseBool("AUDIT_MODE", true)
	if err != nil {
		return nil, fmt.Errorf("invalid AUDIT_MODE: %w", err)
	}
	captchaDigit, err := parseInt("CAPTCHA_DIGIT", 5)
	if err != nil {
		return nil, fmt.Errorf("invalid CAPTCHA_DIGIT: %w", err)
	}
	captchaTimeoutSec, err := parseInt("CAPTCHA_TIMEOUT_SEC", 15)
	if err != nil {
		return nil, fmt.Errorf("invalid CAPTCHA_TIMEOUT_SEC: %w", err)
	}
	greylistTTLSec, err := parseInt("GREYLIST_TTL_SEC", 3600)
	if err != nil {
		return nil, fmt.Errorf("invalid GREYLIST_TTL_SEC: %w", err)
	}

	return &Config{
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379"),
		SIPPort:           sipPort,
		APIPort:           apiPort,
		AuditMode:         auditMode,
		GreenThreshold:    greenThreshold,
		RedThreshold:      redThreshold,
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		GinMode:           getEnv("GIN_MODE", "release"),
		CaptchaDigit:      captchaDigit,
		CaptchaTimeoutSec: captchaTimeoutSec,
		GreylistTTLSec:    greylistTTLSec,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func parseInt(key string, defaultVal int) (int, error) {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal, nil
	}
	return strconv.Atoi(val)
}

func parseBool(key string, defaultVal bool) (bool, error) {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal, nil
	}
	return strconv.ParseBool(val)
}
