package web

type AdminSystemUserDepartment struct {
	DeptID   *uint64 `json:"deptId,omitempty"`
	DeptName string  `json:"deptName"`
}

// AdminSystemUserListItem intentionally excludes password and role-management fields.
type AdminSystemUserListItem struct {
	UserID      uint64                     `json:"userId"`
	DeptID      *uint64                    `json:"deptId,omitempty"`
	UserName    string                     `json:"userName"`
	NickName    string                     `json:"nickName"`
	Email       string                     `json:"email"`
	PhoneNumber string                     `json:"phonenumber"`
	Sex         string                     `json:"sex"`
	Avatar      string                     `json:"avatar"`
	Status      string                     `json:"status"`
	Dept        *AdminSystemUserDepartment `json:"dept,omitempty"`
	LoginIP     string                     `json:"loginIp"`
	LoginDate   string                     `json:"loginDate"`
	CreateBy    string                     `json:"createBy"`
	CreateTime  string                     `json:"createTime"`
	Remark      string                     `json:"remark"`
}
