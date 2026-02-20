// @title           SIP Guard API
// @version         1.0
// @description     Production-ready Go backend service for SIP call scoring and fraud protection.
// @host            localhost:8080
// @BasePath        /

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	_ "sipguard/docs"
	"sipguard/internal/api"
	"sipguard/internal/config"
	"sipguard/internal/scoring"
	"sipguard/internal/sip"
)

func main() {
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	logger := buildLogger(cfg.LogLevel)

	rdb, err := connectRedis(cfg.RedisURL, logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer rdb.Close()

	engine := scoring.NewEngine(rdb, cfg)

	gin.SetMode(cfg.GinMode)
	router := gin.New()

	handler := api.NewHandler(engine)
	api.RegisterRoutes(router, handler, logger)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.APIPort),
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sipListener := sip.NewListener(cfg.SIPPort, engine, cfg, logger)
	if err := sipListener.Start(ctx); err != nil {
		logger.Fatal().Err(err).Msg("failed to start SIP listener")
	}

	go func() {
		logger.Info().
			Int("port", cfg.APIPort).
			Bool("audit_mode", cfg.AuditMode).
			Int("green_threshold", cfg.GreenThreshold).
			Int("red_threshold", cfg.RedThreshold).
			Msg("HTTP server starting")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("HTTP server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	logger.Info().Str("signal", sig.String()).Msg("shutdown signal received")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("HTTP server forced shutdown")
	}

	logger.Info().Msg("server exited cleanly")
}

func connectRedis(redisURL string, logger zerolog.Logger) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis URL: %w", err)
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	logger.Info().Str("url", redisURL).Msg("connected to Redis")
	return rdb, nil
}

func buildLogger(level string) zerolog.Logger {
	zerolog.TimeFieldFormat = time.RFC3339

	lvl, err := zerolog.ParseLevel(level)
	if err != nil {
		lvl = zerolog.InfoLevel
	}

	return zerolog.New(os.Stdout).
		Level(lvl).
		With().
		Timestamp().
		Str("service", "sipguard").
		Logger()
}
