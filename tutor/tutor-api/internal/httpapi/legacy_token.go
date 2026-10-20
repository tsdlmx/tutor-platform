package httpapi

import (
	"errors"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

const legacyLoginRedisPrefix = "login_tokens:"

func (a *API) legacySessionID(authorization string) (string, bool) {
	claims, err := a.parseLegacyJWT(authorization)
	if err != nil {
		return "", false
	}
	sessionID, ok := claims["login_user_key"].(string)
	if !ok || len(sessionID) != 32 || !isHex(sessionID) {
		return "", false
	}
	return sessionID, true
}

func (a *API) parseLegacyJWT(authorization string) (jwt.MapClaims, error) {
	tokenString := strings.TrimSpace(authorization)
	if strings.HasPrefix(tokenString, "Bearer ") {
		tokenString = strings.TrimSpace(strings.TrimPrefix(tokenString, "Bearer "))
	}
	if tokenString == "" || len(tokenString) > 8192 || len(a.config.JWTSecret) < 32 {
		return nil, errors.New("missing or invalid token")
	}
	parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS512 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(a.config.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS512"}))
	if err != nil || parsed == nil || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	return claims, nil
}
