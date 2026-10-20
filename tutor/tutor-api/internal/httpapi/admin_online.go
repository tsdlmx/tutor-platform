package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/redis/go-redis/v9"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

const (
	maxOnlineSessionKeys = 5000
	maxOnlineScanKeys    = 100000
	onlineScanCount      = 500
	onlineReadBatchSize  = 128
)

type legacyOnlineSession struct {
	IPAddr        *string `json:"ipaddr"`
	LoginLocation *string `json:"loginLocation"`
	Browser       *string `json:"browser"`
	OS            *string `json:"os"`
	LoginTime     *int64  `json:"loginTime"`
	User          *struct {
		UserName string `json:"userName"`
		Dept     *struct {
			DeptName *string `json:"deptName"`
		} `json:"dept"`
	} `json:"user"`
}

func (a *API) listAdminOnlineUsers(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	ipaddr, userName := strings.TrimSpace(r.URL.Query().Get("ipaddr")), strings.TrimSpace(r.URL.Query().Get("userName"))
	if utf8.RuneCountInString(ipaddr) > 128 || utf8.RuneCountInString(userName) > 128 {
		writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	users, err := a.readLegacyOnlineUsers(ctx)
	if err != nil {
		a.logger.Error("online session listing failed", "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "在线会话暂时无法查询")
		return
	}
	filtered := users[:0]
	for _, user := range users {
		if ipaddr != "" && (user.IPAddr == nil || *user.IPAddr != ipaddr) {
			continue
		}
		if userName != "" && user.UserName != userName {
			continue
		}
		filtered = append(filtered, user)
	}
	sort.Slice(filtered, func(i, j int) bool {
		left, right := int64(0), int64(0)
		if filtered[i].LoginTime != nil {
			left = *filtered[i].LoginTime
		}
		if filtered[j].LoginTime != nil {
			right = *filtered[j].LoginTime
		}
		if left != right {
			return left > right
		}
		return filtered[i].TokenID < filtered[j].TokenID
	})

	total := int64(len(filtered))
	start := (pageNum - 1) * pageSize
	if start >= len(filtered) {
		writeTable(w, total, []web.AdminOnlineUser{})
		return
	}
	end := start + pageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	writeTable(w, total, filtered[start:end])
}

func (a *API) readLegacyOnlineUsers(ctx context.Context) ([]web.AdminOnlineUser, error) {
	users := make([]web.AdminOnlineUser, 0)
	seen := make(map[string]struct{})
	batch := make([]string, 0, onlineReadBatchSize)
	cursor := uint64(0)
	scanned := 0

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		found, err := a.fetchLegacyOnlineBatch(ctx, batch)
		if err != nil {
			return err
		}
		users = append(users, found...)
		batch = batch[:0]
		return nil
	}

	for {
		keys, next, err := a.redis.Scan(ctx, cursor, legacyLoginRedisPrefix+"*", onlineScanCount).Result()
		if err != nil {
			return nil, err
		}
		scanned += len(keys)
		if scanned > maxOnlineScanKeys {
			return nil, fmt.Errorf("online session scan exceeded limit")
		}
		for _, key := range keys {
			tokenID := strings.TrimPrefix(key, legacyLoginRedisPrefix)
			if len(tokenID) != 32 || !isHex(tokenID) {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			if len(seen) > maxOnlineSessionKeys {
				return nil, fmt.Errorf("online session count exceeded limit")
			}
			batch = append(batch, key)
			if len(batch) == onlineReadBatchSize {
				if err := flush(); err != nil {
					return nil, err
				}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return users, nil
}

func (a *API) fetchLegacyOnlineBatch(ctx context.Context, keys []string) ([]web.AdminOnlineUser, error) {
	pipe := a.redis.Pipeline()
	commands := make([]*redis.StringCmd, len(keys))
	for i, key := range keys {
		commands[i] = pipe.Get(ctx, key)
	}
	_, execErr := pipe.Exec(ctx)
	if execErr != nil && !errors.Is(execErr, redis.Nil) {
		return nil, execErr
	}

	users := make([]web.AdminOnlineUser, 0, len(commands))
	for i, command := range commands {
		payload, err := command.Bytes()
		if errors.Is(err, redis.Nil) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if len(payload) == 0 || len(payload) > 1<<20 {
			return nil, fmt.Errorf("invalid online session payload size")
		}
		var session legacyOnlineSession
		if err := json.Unmarshal(payload, &session); err != nil {
			return nil, fmt.Errorf("decode online session: %w", err)
		}
		if session.User == nil {
			continue
		}
		tokenID := strings.TrimPrefix(keys[i], legacyLoginRedisPrefix)
		user := web.AdminOnlineUser{
			TokenID:       tokenID,
			UserName:      session.User.UserName,
			IPAddr:        session.IPAddr,
			LoginLocation: session.LoginLocation,
			Browser:       session.Browser,
			OS:            session.OS,
			LoginTime:     session.LoginTime,
		}
		if session.User.Dept != nil {
			user.DeptName = session.User.Dept.DeptName
		}
		users = append(users, user)
	}
	return users, nil
}
