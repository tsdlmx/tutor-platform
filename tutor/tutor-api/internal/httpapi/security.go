package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
)

// Transport and response hardening for the JSON API. Browser-facing policy for
// the single-page application is applied by the reverse proxy; the API itself
// never needs to load resources, so the strictest directives are safe here.
const (
	maxRequestBodyBytes = 1 << 20
	requestIDHeader     = "X-Request-Id"
)

type requestIDKey struct{}

// security applies response headers, assigns a request identifier, caps the
// request body, and enforces the cross-origin allowlist before routing.
func (a *API) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := newRequestID()
		w.Header().Set(requestIDHeader, requestID)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=()")
		// API responses can carry personal data, so they must never be cached by a
		// shared cache or the browser history.
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		if !a.applyCORS(w, r) {
			return
		}
		if r.ContentLength > maxRequestBodyBytes {
			writeAPIError(w, http.StatusRequestEntityTooLarge, "请求内容过大")
			return
		}
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, requestID)))
	})
}

// applyCORS answers preflight requests and adds CORS headers only for origins the
// operator configured. It returns false when the request was fully handled.
func (a *API) applyCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	if _, allowed := a.allowedOrigins[origin]; !allowed {
		if _, wildcard := a.allowedOrigins["*"]; !wildcard {
			if r.Method == http.MethodOptions {
				writeAPIError(w, http.StatusForbidden, "跨域来源未授权")
				return false
			}
			// Without an allow header the browser blocks the response. The request is
			// still handled so tooling that omits Origin keeps working.
			return true
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Credentials", "false")
	if r.Method != http.MethodOptions {
		return true
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.WriteHeader(http.StatusNoContent)
	return false
}

func newRequestID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "unavailable"
	}
	return hex.EncodeToString(value)
}

func requestIDFrom(r *http.Request) string {
	if value, ok := r.Context().Value(requestIDKey{}).(string); ok {
		return value
	}
	return ""
}
