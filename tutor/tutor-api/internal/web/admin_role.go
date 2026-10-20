package web

type AdminRoleListItem struct {
	RoleID     uint64 `gorm:"column:role_id" json:"roleId"`
	RoleName   string `gorm:"column:role_name" json:"roleName"`
	RoleKey    string `gorm:"column:role_key" json:"roleKey"`
	RoleSort   *int   `gorm:"column:role_sort" json:"roleSort,omitempty"`
	DataScope  string `gorm:"column:data_scope" json:"dataScope"`
	Status     string `gorm:"column:status" json:"status"`
	CreateTime string `gorm:"column:create_time" json:"createTime"`
	Remark     string `gorm:"column:remark" json:"remark"`
	Admin      bool   `gorm:"column:admin" json:"admin"`
}
