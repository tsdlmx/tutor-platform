package web

type AdminOperationLog struct {
	OperID        uint64 `gorm:"column:oper_id" json:"operId"`
	Title         string `gorm:"column:title" json:"title"`
	BusinessType  int    `gorm:"column:business_type" json:"businessType"`
	Method        string `gorm:"column:method" json:"method"`
	RequestMethod string `gorm:"column:request_method" json:"requestMethod"`
	OperatorType  int    `gorm:"column:operator_type" json:"operatorType"`
	OperName      string `gorm:"column:oper_name" json:"operName"`
	DeptName      string `gorm:"column:dept_name" json:"deptName"`
	OperURL       string `gorm:"column:oper_url" json:"operUrl"`
	OperIP        string `gorm:"column:oper_ip" json:"operIp"`
	OperLocation  string `gorm:"column:oper_location" json:"operLocation"`
	OperParam     string `gorm:"column:oper_param" json:"operParam"`
	JsonResult    string `gorm:"column:json_result" json:"jsonResult"`
	Status        int    `gorm:"column:status" json:"status"`
	ErrorMsg      string `gorm:"column:error_msg" json:"errorMsg"`
	OperTime      string `gorm:"column:oper_time" json:"operTime"`
	CostTime      int64  `gorm:"column:cost_time" json:"costTime"`
}

func (AdminOperationLog) TableName() string {
	return "sys_oper_log"
}
