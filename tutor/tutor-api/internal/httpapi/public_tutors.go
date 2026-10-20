package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

func (a *API) publicTutorList(w http.ResponseWriter, r *http.Request) {
	filter := web.TutorDirectoryFilter{
		Subject:       strings.TrimSpace(r.URL.Query().Get("subject")),
		Constellation: strings.TrimSpace(r.URL.Query().Get("constellation")),
		SortBy:        strings.TrimSpace(r.URL.Query().Get("sortBy")),
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("gradeId")); raw != "" {
		value, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || value == 0 {
			writeAPIError(w, http.StatusBadRequest, "年级参数不合法")
			return
		}
		filter.GradeID = &value
	}
	latitude, err := optionalFloat(r.URL.Query().Get("latitude"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "纬度参数不合法")
		return
	}
	longitude, err := optionalFloat(r.URL.Query().Get("longitude"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "经度参数不合法")
		return
	}
	filter.Latitude, filter.Longitude = latitude, longitude
	rows, err := a.web.ListPublicTutors(r.Context(), filter)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", rows)
}

func (a *API) publicTutorDetail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseUint(r.PathValue("tutorID"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(w, http.StatusBadRequest, "家教 ID 不合法")
		return
	}
	record, err := a.web.GetPublicTutor(r.Context(), id)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", record)
}

func optionalFloat(raw string) (*float64, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil {
		return nil, err
	}
	return &value, nil
}
