package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/config"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"gorm.io/gorm"
)

type API struct {
	logger         *slog.Logger
	db             *gorm.DB
	redis          *redis.Client
	identity       *identity.Service
	web            *web.Service
	config         config.Config
	allowedOrigins map[string]struct{}
}

func New(logger *slog.Logger, db *gorm.DB, redisClient *redis.Client, jwtSecret []byte, cfg config.Config) http.Handler {
	origins := make(map[string]struct{}, len(cfg.AllowedOrigins()))
	for _, origin := range cfg.AllowedOrigins() {
		origins[origin] = struct{}{}
	}
	a := &API{
		logger:         logger,
		db:             db,
		redis:          redisClient,
		identity:       identity.New(db, redisClient, jwtSecret, cfg, logger),
		web:            web.NewService(db),
		config:         cfg,
		allowedOrigins: origins,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", a.live)
	mux.HandleFunc("GET /health/ready", a.ready)
	mux.HandleFunc("GET /captchaImage", a.adminCaptchaImage)
	mux.HandleFunc("POST /login", a.adminLogin)
	mux.HandleFunc("GET /getInfo", a.adminAuth("", a.adminInfo))
	mux.HandleFunc("POST /logout", a.adminLogout)
	mux.HandleFunc("GET /system/user/profile", a.adminAuth("", a.adminProfile))
	mux.HandleFunc("PUT /system/user/profile", a.adminAuth("", a.updateAdminProfile))
	mux.HandleFunc("PUT /system/user/profile/updatePwd", a.adminAuth("", a.updateAdminPassword))
	mux.HandleFunc("DELETE /monitor/online/{tokenID}", a.adminAuth("monitor:online:forceLogout", a.forceLogoutAdminOnline))
	mux.HandleFunc("GET /system/user/list", a.adminAuth("system:user:list", a.listAdminSystemUsers))
	mux.HandleFunc("GET /system/role/list", a.adminAuth("system:role:list", a.listAdminRoles))
	mux.HandleFunc("GET /system/tutorInfo/list", a.adminAuth("system:tutor:list", a.listAdminTutors))
	mux.HandleFunc("GET /system/tutorInfo/{tutorID}", a.adminAuth("system:tutor:query", a.getAdminTutor))
	mux.HandleFunc("PUT /system/tutorInfo/audit", a.adminAuth("system:tutor:edit", a.auditAdminTutor))
	mux.HandleFunc("DELETE /system/tutorInfo/{tutorIDs}", a.adminAuth("system:tutor:remove", a.deleteAdminTutors))
	mux.HandleFunc("GET /system/userPost/list", a.adminAuth("system:userPost:list", a.listAdminPosts))
	mux.HandleFunc("GET /system/userPost/pendingCount", a.adminAuth("system:userPost:list", a.countPendingAdminPosts))
	mux.HandleFunc("PUT /system/userPost/audit", a.adminAuth("system:userPost:audit", a.auditAdminPost))
	mux.HandleFunc("GET /system/customerAccount/list", a.adminAuth("system:customerAccount:list", a.listAdminCustomerAccounts))
	mux.HandleFunc("GET /system/customerAccount/{accountID}", a.adminAuth("system:customerAccount:query", a.getAdminCustomerAccount))
	mux.HandleFunc("PUT /system/customerAccount/status", a.adminAuth("system:customerAccount:edit", a.updateAdminCustomerAccountStatus))
	mux.HandleFunc("GET /system/wxUser/list", a.adminAuth("system:wxUser:list", a.listAdminWxUsers))
	mux.HandleFunc("GET /system/wxUser/{userID}", a.adminAuth("system:wxUser:query", a.getAdminWxUser))
	mux.HandleFunc("GET /monitor/operlog/list", a.adminAuth("monitor:operlog:list", a.listAdminOperationLogs))
	mux.HandleFunc("GET /monitor/online/list", a.adminAuth("monitor:online:list", a.listAdminOnlineUsers))
	mux.HandleFunc("GET /miniapp/auth/checkLogin", a.checkMiniappLogin)
	mux.HandleFunc("POST /customer/auth/send-code", a.sendCode)
	mux.HandleFunc("POST /customer/auth/send-reset-code", a.sendResetCode)
	mux.HandleFunc("POST /customer/auth/reset-password", a.resetPassword)
	mux.HandleFunc("POST /customer/auth/register", a.register)
	mux.HandleFunc("POST /customer/auth/login", a.login)
	mux.HandleFunc("GET /customer/auth/me", a.customerAuth(a.authMe))
	mux.HandleFunc("PUT /customer/auth/role", a.customerAuth(a.setRole))
	mux.HandleFunc("POST /customer/auth/logout", a.customerAuth(a.logout))
	mux.HandleFunc("GET /customer/subjects", a.subjects)
	mux.HandleFunc("GET /customer/demands", a.customerAuth(a.listDemands))
	mux.HandleFunc("GET /customer/demands/stats", a.customerAuth(a.demandStats))
	mux.HandleFunc("GET /customer/demands/applied", a.customerAuth(a.appliedDemands))
	mux.HandleFunc("GET /customer/demands/applications", a.customerAuth(a.receivedApplications))
	mux.HandleFunc("GET /customer/demands/{demandID}", a.customerAuth(a.getDemand))
	mux.HandleFunc("POST /customer/demands", a.customerAuth(a.createDemand))
	mux.HandleFunc("PUT /customer/demands/{demandID}", a.customerAuth(a.updateDemand))
	mux.HandleFunc("DELETE /customer/demands/{demandID}", a.customerAuth(a.deleteDemand))
	mux.HandleFunc("PUT /customer/demands/{demandID}/status", a.customerAuth(a.updateDemandStatus))
	mux.HandleFunc("POST /customer/demands/{demandID}/apply", a.customerAuth(a.applyToDemand))
	mux.HandleFunc("GET /customer/profile/me", a.customerAuth(a.myProfile))
	mux.HandleFunc("PUT /customer/profile", a.customerAuth(a.saveMyProfile))
	mux.HandleFunc("GET /customer/profile/{accountID}/posts", a.customerAuth(a.profilePosts))
	mux.HandleFunc("GET /customer/profile/{accountID}", a.customerAuth(a.profile))
	mux.HandleFunc("GET /customer/posts/mine", a.customerAuth(a.myPosts))
	mux.HandleFunc("GET /customer/posts/plaza", a.customerAuth(a.plazaPosts))
	mux.HandleFunc("POST /customer/posts", a.customerAuth(a.createPost))
	mux.HandleFunc("DELETE /customer/posts/{postID}", a.customerAuth(a.deletePost))
	mux.HandleFunc("GET /miniapp/tutor/list", a.publicTutorList)
	mux.HandleFunc("GET /miniapp/tutor/detail/{tutorID}", a.publicTutorDetail)
	return a.security(a.recover(a.requestLog(mux)))
}

func (a *API) live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) ready(w http.ResponseWriter, r *http.Request) {
	sqlDB, err := a.db.DB()
	if err == nil {
		ctx, cancel := timeAfter(r, 2*time.Second)
		defer cancel()
		err = sqlDB.PingContext(ctx)
		if err == nil {
			err = a.redis.Ping(ctx).Err()
		}
	}
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (a *API) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		a.logger.Info("http request",
			"method", r.Method,
			"path", r.URL.Path,
			"request_id", requestIDFrom(r),
			"duration_ms", time.Since(started).Milliseconds())
	})
}

func (a *API) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				a.logger.Error("http handler panic", "path", r.URL.Path)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func timeAfter(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}
