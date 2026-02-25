package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"sipguard/internal/scanner"
	"sipguard/internal/scoring"
)

type Handler struct {
	engine *scoring.Engine
}

func NewHandler(engine *scoring.Engine) *Handler {
	return &Handler{engine: engine}
}

type checkRequest struct {
	CallerID    string `json:"caller_id" binding:"required" example:"+46701234567"`
	Destination string `json:"destination" binding:"required" example:"+46891234567"`
}

type checkResponse struct {
	Status    string    `json:"status" example:"GREEN"`
	Score     int64     `json:"score" example:"5"`
	Reason    string    `json:"reason" example:"caller +46701234567 has low call frequency (score: 5)"`
	Timestamp time.Time `json:"timestamp" example:"2024-01-15T10:30:00Z"`
	Blocked   bool      `json:"blocked" example:"false"`
}

type statsResponse struct {
	GREEN  int64 `json:"GREEN" example:"100"`
	YELLOW int64 `json:"YELLOW" example:"20"`
	RED    int64 `json:"RED" example:"5"`
}

type whitelistRequest struct {
	Prefix string `json:"prefix" binding:"required" example:"+467"`
	Label  string `json:"label" binding:"required" example:"Swedish mobile"`
	Tier   string `json:"tier" binding:"required,oneof=GREEN YELLOW RED TELCO CLOUD" example:"GREEN"`
}

type errorResponse struct {
	Error string `json:"error" example:"invalid request body"`
}

type messageResponse struct {
	Message string `json:"message" example:"prefix removed from whitelist"`
}

// Check godoc
// @Summary      Score a call attempt
// @Description  Submits a caller_id and destination for scoring. Returns GREEN, YELLOW, or RED status.
// @Tags         scoring
// @Accept       json
// @Produce      json
// @Param        body  body      checkRequest   true  "Call details"
// @Success      200   {object}  checkResponse
// @Failure      400   {object}  errorResponse
// @Failure      500   {object}  errorResponse
// @Router       /api/v1/check [post]
func (h *Handler) Check(c *gin.Context) {
	var req checkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	result, err := h.engine.Check(c.Request.Context(), req.CallerID, req.Destination)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "scoring engine error: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, checkResponse{
		Status:    string(result.Status),
		Score:     result.Score,
		Reason:    result.Reason,
		Timestamp: result.Timestamp,
		Blocked:   result.Blocked,
	})
}

// Stats godoc
// @Summary      Get aggregate call statistics
// @Description  Returns Redis-based counters for each call status category.
// @Tags         scoring
// @Produce      json
// @Success      200  {object}  statsResponse
// @Failure      500  {object}  errorResponse
// @Router       /api/v1/stats [get]
func (h *Handler) Stats(c *gin.Context) {
	stats, err := h.engine.GetStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to get stats: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, statsResponse{
		GREEN:  stats["GREEN"],
		YELLOW: stats["YELLOW"],
		RED:    stats["RED"],
	})
}

// ListWhitelist godoc
// @Summary      List all whitelist entries
// @Description  Returns all caller prefix entries in the whitelist.
// @Tags         whitelist
// @Produce      json
// @Success      200  {array}   scoring.WhitelistEntry
// @Failure      500  {object}  errorResponse
// @Router       /api/v1/whitelist [get]
func (h *Handler) ListWhitelist(c *gin.Context) {
	entries, err := h.engine.GetWhitelist().List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to list whitelist: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, entries)
}

// AddWhitelist godoc
// @Summary      Add a whitelist entry
// @Description  Adds a caller prefix to the whitelist with a label and tier override.
// @Tags         whitelist
// @Accept       json
// @Produce      json
// @Param        body  body      whitelistRequest      true  "Whitelist entry"
// @Success      201   {object}  scoring.WhitelistEntry
// @Failure      400   {object}  errorResponse
// @Failure      500   {object}  errorResponse
// @Router       /api/v1/whitelist [post]
func (h *Handler) AddWhitelist(c *gin.Context) {
	var req whitelistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	entry := &scoring.WhitelistEntry{
		Prefix: req.Prefix,
		Label:  req.Label,
		Tier:   req.Tier,
	}

	if err := h.engine.GetWhitelist().Add(c.Request.Context(), entry); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to add whitelist entry: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

// DeleteWhitelist godoc
// @Summary      Remove a whitelist entry
// @Description  Removes a caller prefix from the whitelist by prefix value (URL-encoded).
// @Tags         whitelist
// @Produce      json
// @Param        prefix  path      string  true  "Caller prefix (e.g. +467)"
// @Success      200     {object}  messageResponse
// @Failure      404     {object}  errorResponse
// @Failure      500     {object}  errorResponse
// @Router       /api/v1/whitelist/{prefix} [delete]
func (h *Handler) DeleteWhitelist(c *gin.Context) {
	prefix := c.Param("prefix")

	if err := h.engine.GetWhitelist().Remove(c.Request.Context(), prefix); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, errorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to remove whitelist entry: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, messageResponse{Message: "prefix removed from whitelist"})
}

// Health godoc
// @Summary      Liveness probe
// @Description  Returns 200 OK when the service is alive.
// @Tags         system
// @Produce      json
// @Success      200  {object}  map[string]string
// @Router       /health [get]
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// ListGreylist godoc
// @Summary      List active greylist entries
// @Description  Returns all YELLOW-tier callers currently in the greylist, with TTL remaining in seconds.
// @Tags         greylist
// @Produce      json
// @Success      200  {array}   scoring.GreylistEntry
// @Failure      500  {object}  errorResponse
// @Router       /api/v1/greylist [get]
func (h *Handler) ListGreylist(c *gin.Context) {
	entries, err := h.engine.GetGreylist().List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to list greylist: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, entries)
}

// DeleteGreylist godoc
// @Summary      Remove a greylist entry
// @Description  Manually removes a caller from the greylist before TTL expiry.
// @Tags         greylist
// @Produce      json
// @Param        id  path      string  true  "Caller ID (e.g. +46701234567)"
// @Success      200  {object}  messageResponse
// @Failure      404  {object}  errorResponse
// @Failure      500  {object}  errorResponse
// @Router       /api/v1/greylist/{id} [delete]
func (h *Handler) DeleteGreylist(c *gin.Context) {
	callerID := c.Param("id")
	if err := h.engine.GetGreylist().Remove(c.Request.Context(), callerID); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, errorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "failed to remove greylist entry: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, messageResponse{Message: "caller removed from greylist"})
}

type scanRequest struct {
	Domain string `json:"domain" binding:"required" example:"example.com"`
}

// ScanDomain godoc
// @Summary      Scan a domain for exposed sensitive files
// @Description  Probes common sensitive paths on a domain to identify files that should not be publicly accessible. Intended for use against systems you own or have explicit authorisation to test.
// @Tags         scanner
// @Accept       json
// @Produce      json
// @Param        body  body      scanRequest         true  "Target domain"
// @Success      200   {object}  scanner.ScanResult
// @Failure      400   {object}  errorResponse
// @Failure      500   {object}  errorResponse
// @Router       /api/v1/scan [post]
func (h *Handler) ScanDomain(c *gin.Context) {
	var req scanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	sc := scanner.New()
	result, err := sc.Scan(c.Request.Context(), req.Domain)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "scan failed: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "not found")
}
