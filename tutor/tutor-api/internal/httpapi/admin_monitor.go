package httpapi

import (
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Monitor payload consumed by the service-monitor screen. The shape mirrors the
// screen's existing fields so the page does not need a visual rewrite, but the
// "jvm" block is replaced by this process's Go runtime figures.
type monitorResponse struct {
	CPU      monitorCPU      `json:"cpu"`
	Mem      monitorMemory   `json:"mem"`
	Runtime  monitorRuntime  `json:"runtime"`
	Sys      monitorSystem   `json:"sys"`
	Database monitorDatabase `json:"database"`
	SysFiles []monitorDisk   `json:"sysFiles"`
}

type monitorCPU struct {
	CPUCount int     `json:"cpuNum"`
	Used     float64 `json:"used"`
	Sys      float64 `json:"sys"`
	User     float64 `json:"user"`
	Wait     float64 `json:"wait"`
	Free     float64 `json:"free"`
}

type monitorMemory struct {
	Total float64 `json:"total"`
	Used  float64 `json:"used"`
	Free  float64 `json:"free"`
	Usage float64 `json:"usage"`
}

type monitorRuntime struct {
	Name       string  `json:"name"`
	Version    string  `json:"version"`
	StartTime  string  `json:"startTime"`
	RunTime    string  `json:"runTime"`
	Goroutines int     `json:"goroutines"`
	GCCount    uint32  `json:"gcCount"`
	HeapTotal  float64 `json:"heapTotal"`
	HeapUsed   float64 `json:"heapUsed"`
	HeapFree   float64 `json:"heapFree"`
	HeapUsage  float64 `json:"heapUsage"`
	Home       string  `json:"home"`
	OS         string  `json:"os"`
	Arch       string  `json:"arch"`
}

type monitorSystem struct {
	ComputerName string `json:"computerName"`
	ComputerIP   string `json:"computerIp"`
	OSName       string `json:"osName"`
	OSArch       string `json:"osArch"`
	UserDir      string `json:"userDir"`
}

type monitorDatabase struct {
	OpenConnections int `json:"open"`
	InUse           int `json:"inUse"`
	Idle            int `json:"idle"`
	WaitCount       int `json:"waiting"`
	MaxOpen         int `json:"maxOpen"`
}

type monitorDisk struct {
	DirName     string  `json:"dirName"`
	SysTypeName string  `json:"sysTypeName"`
	TypeName    string  `json:"typeName"`
	Total       string  `json:"total"`
	Free        string  `json:"free"`
	Used        string  `json:"used"`
	Usage       float64 `json:"usage"`
}

// processStartedAt is the moment this process began serving, used for uptime.
var processStartedAt = time.Now()

// getAdminServerInfo replaces the Java-backed monitor endpoint. It reports host
// CPU/memory/disk plus this process's runtime and database pool figures.
func (a *API) getAdminServerInfo(w http.ResponseWriter, r *http.Request) {
	// Host metrics are best-effort: a restricted container may hide them, and a
	// missing value must not break the whole screen.
	payload := monitorResponse{
		SysFiles: readDiskUsage(),
		Sys:      readSystemInfo(),
		CPU:      readCPUStats(),
		Mem:      readMemoryStats(),
		Runtime:  readRuntimeStats(),
		Database: readDatabasePool(a),
	}
	writeSuccess(w, "操作成功", payload)
}

func readCPUStats() monitorCPU {
	result := monitorCPU{CPUCount: runtime.NumCPU()}
	if counts, err := cpu.Counts(true); err == nil && counts > 0 {
		result.CPUCount = counts
	}
	// A zero interval compares against the previous sample taken in this process.
	if percents, err := cpu.Percent(0, false); err == nil && len(percents) > 0 {
		result.Used = roundTo(percents[0], 1)
	}
	if times, err := cpu.Times(false); err == nil && len(times) > 0 {
		sample := times[0]
		total := sample.User + sample.System + sample.Idle + sample.Iowait + sample.Nice + sample.Irq + sample.Softirq + sample.Steal
		if total > 0 {
			result.User = roundTo((sample.User+sample.Nice)/total*100, 1)
			result.Sys = roundTo(sample.System/total*100, 1)
			result.Wait = roundTo(sample.Iowait/total*100, 1)
			result.Free = roundTo(sample.Idle/total*100, 1)
		}
	}
	result.Free = roundTo(100-result.Used, 1)
	return result
}

func readMemoryStats() monitorMemory {
	stats, err := mem.VirtualMemory()
	if err != nil || stats == nil {
		return monitorMemory{}
	}
	return monitorMemory{
		Total: bytesToGB(stats.Total),
		Used:  bytesToGB(stats.Used),
		Free:  bytesToGB(stats.Available),
		Usage: roundTo(stats.UsedPercent, 1),
	}
}

func readRuntimeStats() monitorRuntime {
	var stats runtime.MemStats
	runtime.ReadMemStats(&stats)
	uptime := time.Since(processStartedAt)
	executable, err := os.Executable()
	if err != nil {
		executable = ""
	}
	heapUsed := float64(stats.HeapAlloc) / (1 << 20)
	heapTotal := float64(stats.HeapSys) / (1 << 20)
	heapUsage := 0.0
	if heapTotal > 0 {
		heapUsage = roundTo(heapUsed/heapTotal*100, 1)
	}
	return monitorRuntime{
		Name:       "Go 运行时",
		Version:    runtime.Version(),
		StartTime:  processStartedAt.Format("2006-01-02 15:04:05"),
		RunTime:    humanDuration(uptime),
		Goroutines: runtime.NumGoroutine(),
		GCCount:    stats.NumGC,
		HeapTotal:  roundTo(heapTotal, 1),
		HeapUsed:   roundTo(heapUsed, 1),
		HeapFree:   roundTo(mathMax(heapTotal-heapUsed, 0), 1),
		HeapUsage:  heapUsage,
		Home:       executable,
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
	}
}

func readSystemInfo() monitorSystem {
	info := monitorSystem{OSArch: runtime.GOARCH, UserDir: workingDirectory()}
	info.OSName = runtime.GOOS
	if hostInfo, err := host.Info(); err == nil && hostInfo != nil {
		info.ComputerName = hostInfo.Hostname
		if hostInfo.OS != "" {
			info.OSName = strings.TrimSpace(hostInfo.Platform + " " + hostInfo.PlatformVersion)
			if info.OSName == "" {
				info.OSName = hostInfo.OS
			}
		}
	}
	info.ComputerIP = primaryIPv4()
	return info
}

func readDiskUsage() []monitorDisk {
	partitions, err := disk.Partitions(false)
	if err != nil {
		return []monitorDisk{}
	}
	seen := make(map[string]struct{}, len(partitions))
	result := make([]monitorDisk, 0, len(partitions))
	for _, partition := range partitions {
		if _, duplicate := seen[partition.Mountpoint]; duplicate {
			continue
		}
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil || usage == nil || usage.Total == 0 {
			continue
		}
		seen[partition.Mountpoint] = struct{}{}
		result = append(result, monitorDisk{
			DirName:     partition.Mountpoint,
			SysTypeName: partition.Fstype,
			TypeName:    "本地磁盘",
			Total:       humanBytes(usage.Total),
			Free:        humanBytes(usage.Free),
			Used:        humanBytes(usage.Used),
			Usage:       roundTo(usage.UsedPercent, 1),
		})
		if len(result) >= 20 {
			break
		}
	}
	return result
}

func readDatabasePool(a *API) monitorDatabase {
	if a.db == nil {
		return monitorDatabase{}
	}
	sqlDB, err := a.db.DB()
	if err != nil {
		return monitorDatabase{}
	}
	stats := sqlDB.Stats()
	return monitorDatabase{
		OpenConnections: stats.OpenConnections,
		InUse:           stats.InUse,
		Idle:            stats.Idle,
		WaitCount:       int(stats.WaitCount),
		MaxOpen:         stats.MaxOpenConnections,
	}
}

func workingDirectory() string {
	directory, err := os.Getwd()
	if err != nil {
		return ""
	}
	return directory
}

// primaryIPv4 returns the host's usable IPv4 address. Loopback and IPv4
// link-local (169.254.0.0/16) addresses are skipped: on a machine with an
// unconfigured adapter the link-local address is enumerated first and would
// otherwise be reported as the server address.
func primaryIPv4() string {
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	fallback := ""
	for _, address := range addresses {
		network, ok := address.(*net.IPNet)
		if !ok || network.IP.IsLoopback() || network.IP.IsLinkLocalUnicast() {
			continue
		}
		ipv4 := network.IP.To4()
		if ipv4 == nil {
			continue
		}
		if ipv4.IsPrivate() || ipv4.IsGlobalUnicast() {
			return ipv4.String()
		}
		if fallback == "" {
			fallback = ipv4.String()
		}
	}
	return fallback
}

func roundTo(value float64, decimals int) float64 {
	scale := 1.0
	for i := 0; i < decimals; i++ {
		scale *= 10
	}
	return float64(int64(value*scale+0.5)) / scale
}

func bytesToGB(value uint64) float64 {
	return roundTo(float64(value)/(1<<30), 1)
}

func humanBytes(value uint64) string {
	const unit = 1024
	if value < unit {
		return "0 B"
	}
	units := []string{"K", "M", "G", "T", "P"}
	size := float64(value)
	index := -1
	for size >= unit && index < len(units)-1 {
		size /= unit
		index++
	}
	return strconv.FormatFloat(size, 'f', 1, 64) + units[index]
}

func mathMax(left, right float64) float64 {
	if left > right {
		return left
	}
	return right
}

func humanDuration(duration time.Duration) string {
	if duration < time.Minute {
		return "刚刚启动"
	}
	days := int(duration.Hours()) / 24
	hours := int(duration.Hours()) % 24
	minutes := int(duration.Minutes()) % 60
	parts := make([]string, 0, 3)
	if days > 0 {
		parts = append(parts, strconv.Itoa(days)+" 天")
	}
	if hours > 0 {
		parts = append(parts, strconv.Itoa(hours)+" 小时")
	}
	parts = append(parts, strconv.Itoa(minutes)+" 分")
	return strings.Join(parts, " ")
}
