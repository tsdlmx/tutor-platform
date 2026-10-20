package httpapi

import "strings"

// describeUserAgent derives a short browser and operating-system label from the
// stored user agent. The audit store keeps the raw string as evidence; this only
// produces the two display columns the log screen expects.
func describeUserAgent(userAgent string) (browser, operatingSystem string) {
	userAgent = strings.TrimSpace(userAgent)
	if userAgent == "" {
		return "", ""
	}
	lower := strings.ToLower(userAgent)
	switch {
	case strings.Contains(lower, "edg/"):
		browser = "Edge"
	case strings.Contains(lower, "opr/") || strings.Contains(lower, "opera"):
		browser = "Opera"
	case strings.Contains(lower, "chrome/") || strings.Contains(lower, "chromium"):
		browser = "Chrome"
	case strings.Contains(lower, "firefox/"):
		browser = "Firefox"
	case strings.Contains(lower, "safari/"):
		browser = "Safari"
	case strings.Contains(lower, "curl/"):
		browser = "curl"
	case strings.Contains(lower, "wget/"):
		browser = "wget"
	case strings.Contains(lower, "python-") || strings.Contains(lower, "go-http-client"):
		browser = "HTTP 客户端"
	default:
		browser = "未知"
	}
	switch {
	case strings.Contains(lower, "windows nt"):
		operatingSystem = "Windows"
	case strings.Contains(lower, "android"):
		operatingSystem = "Android"
	case strings.Contains(lower, "iphone"), strings.Contains(lower, "ipad"), strings.Contains(lower, "ios"):
		operatingSystem = "iOS"
	case strings.Contains(lower, "mac os x"), strings.Contains(lower, "macintosh"):
		operatingSystem = "macOS"
	case strings.Contains(lower, "linux"):
		operatingSystem = "Linux"
	default:
		operatingSystem = "未知"
	}
	return browser, operatingSystem
}
