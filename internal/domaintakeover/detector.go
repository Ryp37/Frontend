package domaintakeover

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// VulnerableService defines a cloud/SaaS platform that can be taken over
// when a dangling CNAME record points to an unclaimed resource on it.
type VulnerableService struct {
	Name          string
	CNAMESuffixes []string // domain suffixes that indicate this service
	Fingerprints  []string // HTTP body strings returned when no account is registered
}

// knownServices is the list of platforms checked for potential takeover.
var knownServices = []VulnerableService{
	{
		Name:          "GitHub Pages",
		CNAMESuffixes: []string{".github.io", ".github.com"},
		Fingerprints:  []string{"There isn't a GitHub Pages site here.", "For root URLs (like http://example.com/) you must provide an index.html file"},
	},
	{
		Name:          "Heroku",
		CNAMESuffixes: []string{".herokudns.com", ".herokuapp.com"},
		Fingerprints:  []string{"No such app", "herokucdn.com/error-pages/no-such-app.html"},
	},
	{
		Name:          "Fastly",
		CNAMESuffixes: []string{".fastly.net", ".fastlylb.net"},
		Fingerprints:  []string{"Fastly error: unknown domain", "Please check that this domain has been added to a service"},
	},
	{
		Name:          "Shopify",
		CNAMESuffixes: []string{".myshopify.com", ".shopify.com"},
		Fingerprints:  []string{"Sorry, this shop is currently unavailable.", "Only one step away from your own online store!"},
	},
	{
		Name: "AWS S3",
		CNAMESuffixes: []string{
			".s3.amazonaws.com",
			".s3-website-us-east-1.amazonaws.com",
			".s3-website.us-east-2.amazonaws.com",
			".s3-website-us-west-1.amazonaws.com",
			".s3-website-us-west-2.amazonaws.com",
			".s3-website.ap-southeast-1.amazonaws.com",
			".s3-website.eu-west-1.amazonaws.com",
		},
		Fingerprints: []string{"NoSuchBucket", "The specified bucket does not exist"},
	},
	{
		Name:          "Surge.sh",
		CNAMESuffixes: []string{".surge.sh"},
		Fingerprints:  []string{"project not found", "Surge - 404"},
	},
	{
		Name:          "Tumblr",
		CNAMESuffixes: []string{".tumblr.com"},
		Fingerprints:  []string{"There's nothing here.", "Whatever you were looking for doesn't currently exist at this address."},
	},
	{
		Name:          "Ghost",
		CNAMESuffixes: []string{".ghost.io"},
		Fingerprints:  []string{"The thing you were looking for is no longer here", "Ghost: Failed to load"},
	},
	{
		Name:          "ReadMe.io",
		CNAMESuffixes: []string{".readme.io"},
		Fingerprints:  []string{"Project doesnt exist... yet!", "We couldn't find that page"},
	},
	{
		Name:          "Zendesk",
		CNAMESuffixes: []string{".zendesk.com"},
		Fingerprints:  []string{"Help Center Closed", "Redirecting you to Zendesk"},
	},
	{
		Name:          "Unbounce",
		CNAMESuffixes: []string{".unbouncepages.com", ".unbounce.com"},
		Fingerprints:  []string{"The requested URL was not found on this server.", "Unbounce Conversion Rate Optimization"},
	},
	{
		Name:          "Azure",
		CNAMESuffixes: []string{".azurewebsites.net", ".azure-api.net", ".azurehdinsight.net", ".cloudapp.net", ".trafficmanager.net"},
		Fingerprints:  []string{"404 Web Site not found.", "Web App - Unavailable"},
	},
	{
		Name:          "Pantheon",
		CNAMESuffixes: []string{".pantheonsite.io", ".pantheon.io"},
		Fingerprints:  []string{"The gods are wise, but do not know of the site which you seek.", "404 Target Not Deployed"},
	},
	{
		Name:          "Freshdesk",
		CNAMESuffixes: []string{".freshdesk.com"},
		Fingerprints:  []string{"There is no helpdesk here", "Support Center - Your Company Name"},
	},
	{
		Name:          "UserVoice",
		CNAMESuffixes: []string{".uservoice.com"},
		Fingerprints:  []string{"This UserVoice subdomain is currently available!", "404: Page Not Found"},
	},
	{
		Name:          "Pingdom",
		CNAMESuffixes: []string{".pingdom.com"},
		Fingerprints:  []string{"This public status page does not seem to exist.", "Pingdom - 404"},
	},
	{
		Name:          "HelpJuice",
		CNAMESuffixes: []string{".helpjuice.com"},
		Fingerprints:  []string{"We could not find what you're looking for.", "We could not find what you're looking for"},
	},
	{
		Name:          "Statuspage",
		CNAMESuffixes: []string{".statuspage.io"},
		Fingerprints:  []string{"page not found", "Status page does not exist"},
	},
	{
		Name:          "Webflow",
		CNAMESuffixes: []string{".webflow.io"},
		Fingerprints:  []string{"The page you are looking for doesn't exist or has been moved.", "Sorry, this page does not exist."},
	},
	{
		Name:          "Netlify",
		CNAMESuffixes: []string{".netlify.app", ".netlify.com"},
		Fingerprints:  []string{"Not Found - Request ID:", "netlify-error"},
	},
	{
		Name:          "Cargo",
		CNAMESuffixes: []string{".cargocollective.com"},
		Fingerprints:  []string{"If you're moving your site to Cargo", "404 Not Found"},
	},
	{
		Name:          "Teamwork",
		CNAMESuffixes: []string{".teamwork.com"},
		Fingerprints:  []string{"Oops - We didn't find your site.", "There is no site here"},
	},
	{
		Name:          "WordPress.com",
		CNAMESuffixes: []string{".wordpress.com"},
		Fingerprints:  []string{"Do you want to register", "doesn't exist"},
	},
}

// DomainResult holds the outcome of scanning a single domain.
type DomainResult struct {
	Domain     string `json:"domain"`
	CNAME      string `json:"cname,omitempty"`
	Vulnerable bool   `json:"vulnerable"`
	Service    string `json:"service,omitempty"`
	Reason     string `json:"reason"`
	Error      string `json:"error,omitempty"`
}

// ScanRequest is the JSON body accepted by the scan endpoint.
type ScanRequest struct {
	Domains []string `json:"domains" binding:"required"`
}

// ScanResponse wraps results with summary counts.
type ScanResponse struct {
	Results    []DomainResult `json:"results"`
	Scanned    int            `json:"scanned"`
	Vulnerable int            `json:"vulnerable"`
}

// Detector performs domain takeover detection using DNS lookups and HTTP probing.
type Detector struct {
	client *http.Client
}

// New returns a Detector with a tuned HTTP client.
func New() *Detector {
	return &Detector{
		client: &http.Client{
			Timeout: 8 * time.Second,
			// Follow up to 3 redirects so we land on the real error page.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return http.ErrUseLastResponse
				}
				return nil
			},
		},
	}
}

// Scan checks each domain for subdomain takeover vulnerabilities.
func (d *Detector) Scan(ctx context.Context, domains []string) ScanResponse {
	results := make([]DomainResult, 0, len(domains))
	vulnCount := 0

	for _, domain := range domains {
		domain = strings.TrimSpace(domain)
		if domain == "" {
			continue
		}
		r := d.checkDomain(ctx, domain)
		results = append(results, r)
		if r.Vulnerable {
			vulnCount++
		}
	}

	return ScanResponse{
		Results:    results,
		Scanned:    len(results),
		Vulnerable: vulnCount,
	}
}

// checkDomain runs full detection for one domain:
//  1. DNS CNAME lookup
//  2. A/AAAA record resolution (detect dangling CNAME)
//  3. HTTP fingerprint probe against known services
func (d *Detector) checkDomain(ctx context.Context, domain string) DomainResult {
	result := DomainResult{Domain: domain}

	// --- Step 1: CNAME resolution ---
	cname, err := net.LookupCNAME(domain)
	if err != nil {
		result.Error = fmt.Sprintf("DNS lookup failed: %v", err)
		result.Reason = "DNS resolution failed — domain may not exist"
		return result
	}
	// LookupCNAME returns at least the input (FQDN with trailing dot) even without a CNAME record.
	cname = strings.TrimSuffix(cname, ".")
	domain = strings.TrimSuffix(domain, ".")
	if !strings.EqualFold(cname, domain) {
		result.CNAME = cname
	}

	// --- Step 2: Check if domain resolves to any IP ---
	addrs, dnsErr := net.DefaultResolver.LookupHost(ctx, domain)
	if dnsErr != nil || len(addrs) == 0 {
		// No A/AAAA record → dangling DNS or NXDOMAIN
		if result.CNAME != "" {
			result.Vulnerable = true
			result.Reason = fmt.Sprintf("CNAME %s does not resolve — dangling DNS record", result.CNAME)
			// Attempt to identify the service from CNAME suffix
			for _, svc := range knownServices {
				for _, suffix := range svc.CNAMESuffixes {
					if strings.HasSuffix(strings.ToLower(result.CNAME), strings.ToLower(suffix)) {
						result.Service = svc.Name
						result.Reason = fmt.Sprintf("Dangling CNAME to %s (%s) — no active resource found", svc.Name, result.CNAME)
						return result
					}
				}
			}
		} else {
			result.Reason = "Domain does not resolve (NXDOMAIN or no records)"
		}
		return result
	}

	// --- Step 3: Match CNAME against known vulnerable services ---
	cnameToCheck := result.CNAME
	if cnameToCheck == "" {
		cnameToCheck = domain
	}

	for _, svc := range knownServices {
		matched := false
		for _, suffix := range svc.CNAMESuffixes {
			if strings.HasSuffix(strings.ToLower(cnameToCheck), strings.ToLower(suffix)) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}

		// --- Step 4: HTTP probe for takeover fingerprint ---
		body, probeErr := d.probe(ctx, domain)
		if probeErr != nil {
			result.Reason = fmt.Sprintf("CNAME points to %s but HTTP probe failed: %v", svc.Name, probeErr)
			return result
		}

		for _, fp := range svc.Fingerprints {
			if strings.Contains(body, fp) {
				result.Vulnerable = true
				result.Service = svc.Name
				result.Reason = fmt.Sprintf("Possible takeover: CNAME to %s returns unclaimed-resource fingerprint", svc.Name)
				return result
			}
		}

		// CNAME matched but no takeover fingerprint → service is actively claimed
		result.Reason = fmt.Sprintf("CNAME points to %s — service appears claimed (no takeover fingerprint detected)", svc.Name)
		return result
	}

	// Domain resolves and CNAME (if any) is not a known vulnerable service
	if result.CNAME != "" {
		result.Reason = fmt.Sprintf("CNAME → %s — not a known vulnerable service provider", result.CNAME)
	} else {
		result.Reason = "Domain resolves normally — no takeover indicators detected"
	}
	return result
}

// probe fetches the HTTP (then HTTPS) body of domain, limited to 32 KB.
func (d *Detector) probe(ctx context.Context, domain string) (string, error) {
	for _, scheme := range []string{"http", "https"} {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, scheme+"://"+domain, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "SIPGuard-DomainScanner/1.0 (security-scanner)")
		resp, err := d.client.Do(req)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
		return string(body), nil
	}
	return "", fmt.Errorf("both HTTP and HTTPS probes failed for %s", domain)
}
