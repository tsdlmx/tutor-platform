package web

type AdminOnlineUser struct {
	TokenID       string  `json:"tokenId"`
	UserName      string  `json:"userName"`
	DeptName      *string `json:"deptName,omitempty"`
	IPAddr        *string `json:"ipaddr,omitempty"`
	LoginLocation *string `json:"loginLocation,omitempty"`
	Browser       *string `json:"browser,omitempty"`
	OS            *string `json:"os,omitempty"`
	LoginTime     *int64  `json:"loginTime,omitempty"`
}
