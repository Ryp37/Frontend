package sip

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"

	"github.com/rs/zerolog"
	"sipguard/internal/captcha"
	"sipguard/internal/config"
	"sipguard/internal/scoring"
)

var (
	fromRegex = regexp.MustCompile(`(?i)^From\s*:.*?(?:sip:|tel:)?(\+?[\d]+)`)
	toRegex   = regexp.MustCompile(`(?i)^To\s*:.*?(?:sip:|tel:)?(\+?[\d]+)`)
)

type ParsedINVITE struct {
	CallerID    string
	Destination string
	RawMessage  string
}

type Listener struct {
	port   int
	engine *scoring.Engine
	cfg    *config.Config
	log    zerolog.Logger
}

func NewListener(port int, engine *scoring.Engine, cfg *config.Config, log zerolog.Logger) *Listener {
	return &Listener{
		port:   port,
		engine: engine,
		cfg:    cfg,
		log:    log,
	}
}

func (l *Listener) Start(ctx context.Context) error {
	addr := fmt.Sprintf(":%d", l.port)
	conn, err := net.ListenPacket("udp", addr)
	if err != nil {
		return fmt.Errorf("udp listen on %s: %w", addr, err)
	}

	l.log.Info().Str("addr", addr).Msg("SIP UDP listener started")

	go func() {
		<-ctx.Done()
		conn.Close()
		l.log.Info().Msg("SIP UDP listener stopped")
	}()

	go l.loop(ctx, conn)
	return nil
}

func (l *Listener) loop(ctx context.Context, conn net.PacketConn) {
	buf := make([]byte, 65535)
	for {
		n, remoteAddr, err := conn.ReadFrom(buf)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				l.log.Error().Err(err).Msg("SIP read error")
				continue
			}
		}

		raw := string(buf[:n])
		go l.handlePacket(ctx, conn, remoteAddr, raw)
	}
}

func (l *Listener) handlePacket(ctx context.Context, conn net.PacketConn, addr net.Addr, raw string) {
	if !isINVITE(raw) {
		return
	}

	parsed, err := Parse(raw)
	if err != nil {
		l.log.Warn().Err(err).Str("remote", addr.String()).Msg("failed to parse SIP INVITE")
		writeResponse(conn, addr, sipDecline(raw))
		return
	}

	l.log.Info().
		Str("caller_id", parsed.CallerID).
		Str("destination", parsed.Destination).
		Str("remote", addr.String()).
		Msg("SIP INVITE received")

	result, err := l.engine.Check(ctx, parsed.CallerID, parsed.Destination)
	if err != nil {
		l.log.Error().Err(err).Msg("scoring engine error")
		writeResponse(conn, addr, sipDecline(raw))
		return
	}

	l.log.Info().
		Str("caller_id", parsed.CallerID).
		Str("status", string(result.Status)).
		Int64("score", result.Score).
		Bool("blocked", result.Blocked).
		Msg("SIP INVITE scored")

	if l.engine.ShouldBlock(result) {
		digit := strconv.Itoa(l.cfg.CaptchaDigit)
		ch := captcha.NewMock(parsed.CallerID, digit, l.log)
		ch.Send()
		ch.Verify("")
		writeResponse(conn, addr, buildResponse(raw, fmt.Sprintf("183 Press %s to continue", digit)))
		writeResponse(conn, addr, sipDecline(raw))
		return
	}

	writeResponse(conn, addr, sipOK(raw))
}

func Parse(raw string) (*ParsedINVITE, error) {
	callerID := extractHeader(raw, fromRegex)
	destination := extractHeader(raw, toRegex)

	if callerID == "" {
		return nil, fmt.Errorf("missing or invalid From header")
	}
	if destination == "" {
		return nil, fmt.Errorf("missing or invalid To header")
	}

	return &ParsedINVITE{
		CallerID:    callerID,
		Destination: destination,
		RawMessage:  raw,
	}, nil
}

func extractHeader(raw string, re *regexp.Regexp) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		matches := re.FindStringSubmatch(line)
		if len(matches) >= 2 {
			return matches[1]
		}
	}
	return ""
}

func isINVITE(raw string) bool {
	firstLine := strings.SplitN(raw, "\n", 2)[0]
	return strings.HasPrefix(strings.TrimSpace(firstLine), "INVITE")
}

func extractCallID(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.HasPrefix(strings.ToLower(line), "call-id:") {
			return strings.TrimSpace(line[8:])
		}
	}
	return ""
}

func extractCSeq(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.HasPrefix(strings.ToLower(line), "cseq:") {
			return strings.TrimSpace(line[5:])
		}
	}
	return ""
}

func extractVia(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.HasPrefix(strings.ToLower(line), "via:") {
			return strings.TrimSpace(line[4:])
		}
	}
	return ""
}

func sipOK(raw string) string {
	return buildResponse(raw, "200 OK")
}

func sipDecline(raw string) string {
	return buildResponse(raw, "603 Decline")
}

func buildResponse(raw, statusLine string) string {
	callID := extractCallID(raw)
	via := extractVia(raw)
	cseq := extractCSeq(raw)

	from := ""
	to := ""
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "from:") {
			from = line
		} else if strings.HasPrefix(lower, "to:") {
			to = line
		}
	}

	return fmt.Sprintf(
		"SIP/2.0 %s\r\n"+
			"Via: %s\r\n"+
			"%s\r\n"+
			"%s\r\n"+
			"Call-ID: %s\r\n"+
			"CSeq: %s\r\n"+
			"Content-Length: 0\r\n\r\n",
		statusLine, via, from, to, callID, cseq,
	)
}

func writeResponse(conn net.PacketConn, addr net.Addr, msg string) {
	conn.WriteTo([]byte(msg), addr)
}
