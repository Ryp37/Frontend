package scanner

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ScanTarget defines a path to probe and metadata about what it might expose.
type ScanTarget struct {
	Path        string
	Description string
	Severity    string // "critical", "high", "medium"
}

// Finding is a confirmed exposed path.
type Finding struct {
	URL         string `json:"url"`
	Path        string `json:"path"`
	StatusCode  int    `json:"status_code"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	ContentLen  int64  `json:"content_length"`
}

// ScanResult is the full result of a domain scan.
type ScanResult struct {
	Domain   string    `json:"domain"`
	Findings []Finding `json:"findings"`
	Scanned  int       `json:"scanned"`
	Found    int       `json:"found"`
}

// Targets is the list of sensitive paths to probe.
var Targets = []ScanTarget{
	// Critical – direct credential / secret exposure
	{"/.env", "Environment variables – may contain API keys and passwords", "critical"},
	{"/.env.local", "Local environment overrides – may contain secrets", "critical"},
	{"/.env.production", "Production environment variables", "critical"},
	{"/.env.backup", "Environment backup file", "critical"},
	{"/.env.old", "Old environment variables file", "critical"},
	{"/.git/config", "Git repository configuration", "critical"},
	{"/.git/HEAD", "Git HEAD ref – confirms exposed repository", "critical"},
	{"/wp-config.php", "WordPress config – database credentials", "critical"},
	{"/config.php", "PHP configuration file", "critical"},
	{"/database.yml", "Database configuration (Rails)", "critical"},
	{"/config/database.yml", "Database config with credentials", "critical"},
	{"/settings.py", "Django settings file", "critical"},
	{"/.aws/credentials", "AWS credentials file", "critical"},
	{"/credentials.json", "Credentials file", "critical"},
	{"/secrets.json", "Secrets configuration file", "critical"},
	{"/private.key", "Private key file", "critical"},
	{"/server.key", "Server private key", "critical"},
	{"/id_rsa", "SSH private key", "critical"},
	{"/.ssh/id_rsa", "SSH private key in .ssh directory", "critical"},

	// High – configuration / backup files
	{"/config.json", "Application config – may contain sensitive settings", "high"},
	{"/config.yml", "YAML configuration file", "high"},
	{"/config.yaml", "YAML configuration file", "high"},
	{"/.htpasswd", "Apache password file – hashed credentials", "high"},
	{"/phpinfo.php", "PHP info page – server/environment disclosure", "high"},
	{"/web.config", "IIS configuration file", "high"},
	{"/backup.sql", "SQL database backup", "high"},
	{"/dump.sql", "SQL database dump", "high"},
	{"/db.sql", "SQL database file", "high"},
	{"/database.sql", "SQL database backup", "high"},
	{"/.DS_Store", "macOS directory metadata – reveals file structure", "high"},
	{"/server-status", "Apache server-status page", "high"},
	{"/server-info", "Apache server-info page – module disclosure", "high"},
	{"/elmah.axd", ".NET error log viewer", "high"},
	{"/trace.axd", "ASP.NET trace viewer", "high"},
	{"/adminer.php", "Adminer database management tool", "high"},
	{"/phpmyadmin/", "phpMyAdmin database management interface", "high"},
	{"/admin/", "Admin panel", "high"},
	{"/wp-admin/", "WordPress admin panel", "high"},

	// Medium – information disclosure
	{"/robots.txt", "Robots.txt – may reveal hidden paths", "medium"},
	{"/composer.json", "PHP Composer manifest – dependency disclosure", "medium"},
	{"/package.json", "Node.js package manifest – dependency disclosure", "medium"},
	{"/Gemfile", "Ruby Gemfile – dependency disclosure", "medium"},
	{"/requirements.txt", "Python dependencies", "medium"},
	{"/README.md", "README file – may reveal internal details", "medium"},
	{"/CHANGELOG.md", "Changelog – version/feature disclosure", "medium"},
	{"/.well-known/security.txt", "Security policy contact info", "medium"},
	{"/crossdomain.xml", "Flash cross-domain policy", "medium"},
	{"/clientaccesspolicy.xml", "Silverlight cross-domain policy", "medium"},
	{"/sitemap.xml", "Sitemap – URL structure disclosure", "medium"},
	{"/swagger.json", "Swagger API specification", "medium"},
	{"/swagger/v1/swagger.json", "Swagger API specification", "medium"},
	{"/api-docs", "API documentation page", "medium"},
	{"/api/swagger.json", "Swagger API specification", "medium"},
}

// Scanner probes a domain for exposed sensitive files.
type Scanner struct {
	client *http.Client
}

// New creates a Scanner with a sensible timeout and redirect policy.
func New() *Scanner {
	return &Scanner{
		client: &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

// Scan probes all targets on the given domain and returns findings.
// Only paths that return HTTP 200 are included in findings.
func (s *Scanner) Scan(ctx context.Context, domain string) (*ScanResult, error) {
	domain = strings.TrimRight(domain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}

	result := &ScanResult{
		Domain:   domain,
		Findings: []Finding{},
	}

	for _, target := range Targets {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		url := domain + target.Path
		statusCode, contentLen, err := s.probe(ctx, url)
		if err != nil {
			continue
		}
		result.Scanned++

		if statusCode == http.StatusOK {
			result.Findings = append(result.Findings, Finding{
				URL:         url,
				Path:        target.Path,
				StatusCode:  statusCode,
				Severity:    target.Severity,
				Description: target.Description,
				ContentLen:  contentLen,
			})
		}
	}

	result.Found = len(result.Findings)
	return result, nil
}

// probe makes a HEAD request (falling back to GET) and returns the status code
// and content length. Returns an error if the request fails entirely.
func (s *Scanner) probe(ctx context.Context, url string) (int, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("User-Agent", "SIPGuard-Scanner/1.0 (security-audit)")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	// Some servers reject HEAD; retry with GET.
	if resp.StatusCode == http.StatusMethodNotAllowed {
		req2, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return resp.StatusCode, resp.ContentLength, nil
		}
		req2.Header.Set("User-Agent", "SIPGuard-Scanner/1.0 (security-audit)")
		resp2, err := s.client.Do(req2)
		if err != nil {
			return resp.StatusCode, resp.ContentLength, nil
		}
		defer resp2.Body.Close()
		return resp2.StatusCode, resp2.ContentLength, nil
	}

	return resp.StatusCode, resp.ContentLength, nil
}
