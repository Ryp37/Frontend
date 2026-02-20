package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func RegisterRoutes(r *gin.Engine, h *Handler, log zerolog.Logger) {
	r.Use(requestLogger(log))
	r.Use(gin.Recovery())

	r.GET("/health", h.Health)
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	v1 := r.Group("/api/v1")
	{
		v1.POST("/check", h.Check)
		v1.GET("/stats", h.Stats)

		wl := v1.Group("/whitelist")
		{
			wl.GET("", h.ListWhitelist)
			wl.POST("", h.AddWhitelist)
			wl.DELETE("/:prefix", h.DeleteWhitelist)
		}

		gl := v1.Group("/greylist")
		{
			gl.GET("", h.ListGreylist)
			gl.DELETE("/:id", h.DeleteGreylist)
		}
	}
}

func requestLogger(log zerolog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Dur("latency", time.Since(start)).
			Str("ip", c.ClientIP()).
			Msg("request")
	}
}
