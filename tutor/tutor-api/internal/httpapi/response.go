package httpapi

import "net/http"

type apiResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data,omitempty"`
}

func writeSuccess(w http.ResponseWriter, message string, data any) {
	writeJSON(w, http.StatusOK, apiResponse{Code: http.StatusOK, Msg: message, Data: data})
}

func writeAPIError(w http.ResponseWriter, status int, message string) {
	if status < 400 || status > 599 {
		status = http.StatusInternalServerError
	}
	writeJSON(w, status, apiResponse{Code: status, Msg: message})
}
