package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/redis/go-redis/v9"
)

type miniappLoginState struct {
	IsLogin bool    `json:"isLogin"`
	UserID  *uint64 `json:"userId"`
}

func (a *API) checkMiniappLogin(w http.ResponseWriter, r *http.Request) {
	state := miniappLoginState{}
	sessionID, ok := a.legacySessionID(r.Header.Get("Authorization"))
	if !ok {
		writeSuccess(w, "查询成功", state)
		return
	}

	payload, err := a.redis.Get(r.Context(), legacyLoginRedisPrefix+sessionID).Bytes()
	if errors.Is(err, redis.Nil) {
		writeSuccess(w, "查询成功", state)
		return
	}
	if err != nil {
		a.logger.Error("miniapp login state Redis failure", "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "服务暂时不可用")
		return
	}
	if len(payload) == 0 || len(payload) > 1<<20 {
		writeSuccess(w, "查询成功", state)
		return
	}

	var cached struct {
		UserID json.Number `json:"userId"`
	}
	// 旧会话以 FastJSON 保存；这里只读 userId，不实例化 @type 元数据。
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	if err := decoder.Decode(&cached); err != nil {
		writeSuccess(w, "查询成功", state)
		return
	}
	userID, err := strconv.ParseUint(cached.UserID.String(), 10, 64)
	if err != nil || userID == 0 {
		writeSuccess(w, "查询成功", state)
		return
	}

	state.IsLogin = true
	state.UserID = &userID
	writeSuccess(w, "查询成功", state)
}
