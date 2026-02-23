#!/usr/bin/env python3
"""
Subdomain Takeover Scanner
Automated tool to detect potential subdomain takeover vulnerabilities

Usage: python3 subdomain_takeover_scanner.py -d target.com
"""

import dns.resolver
import requests
import sys
from typing import Dict, List, Tuple

# Fingerprints for common vulnerable services
TAKEOVER_FINGERPRINTS = {
    'github': {
        'cname': ['github.io', 'github.com'],
        'error': ['There isn\'t a GitHub Pages site here', 'For root URLs'],
        'description': 'GitHub Pages'
    },
    'heroku': {
        'cname': ['herokuapp.com', 'herokussl.com'],
        'error': ['No such app', 'There\'s nothing here', 'herokucdn.com/error-pages'],
        'description': 'Heroku'
    },
    'aws_s3': {
        'cname': ['s3.amazonaws.com', 's3-website'],
        'error': ['NoSuchBucket', 'The specified bucket does not exist'],
        'description': 'AWS S3'
    },
    'cloudfront': {
        'cname': ['cloudfront.net'],
        'error': ['Bad request', 'ERROR: The request could not be satisfied'],
        'description': 'AWS CloudFront'
    },
    'azure': {
        'cname': ['azurewebsites.net', 'cloudapp.net', 'trafficmanager.net'],
        'error': ['404 Web Site not found', '404 Not Found'],
        'description': 'Microsoft Azure'
    },
    'shopify': {
        'cname': ['myshopify.com'],
        'error': ['Sorry, this shop is currently unavailable'],
        'description': 'Shopify'
    },
    'wordpress': {
        'cname': ['wordpress.com'],
        'error': ['Do you want to register'],
        'description': 'WordPress.com'
    },
    'bitbucket': {
        'cname': ['bitbucket.io'],
        'error': ['Repository not found'],
        'description': 'Bitbucket'
    },
    'fastly': {
        'cname': ['fastly.net'],
        'error': ['Fastly error: unknown domain'],
        'description': 'Fastly'
    },
    'pantheon': {
        'cname': ['pantheonsite.io'],
        'error': ['404 error unknown site!'],
        'description': 'Pantheon'
    }
}

class Colors:
    """ANSI color codes"""
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def banner():
    """Display tool banner"""
    print(f"{Colors.CYAN}{Colors.BOLD}")
    print("╔════════════════════════════════════════════════════════╗")
    print("║       SUBDOMAIN TAKEOVER VULNERABILITY SCANNER        ║")
    print("║                  by Security Researcher                ║")
    print("╚════════════════════════════════════════════════════════╝")
    print(f"{Colors.RESET}\n")

def get_cname(subdomain: str) -> List[str]:
    """
    Get CNAME records for a subdomain

    Args:
        subdomain: Target subdomain to check

    Returns:
        List of CNAME records
    """
    try:
        answers = dns.resolver.resolve(subdomain, 'CNAME')
        return [str(rdata.target).rstrip('.') for rdata in answers]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.DNSException):
        return []

def check_http_response(subdomain: str) -> Tuple[int, str]:
    """
    Check HTTP response from subdomain

    Args:
        subdomain: Target subdomain

    Returns:
        Tuple of (status_code, response_body)
    """
    try:
        response = requests.get(
            f'https://{subdomain}',
            timeout=10,
            verify=False,
            allow_redirects=True
        )
        return response.status_code, response.text
    except requests.exceptions.RequestException:
        try:
            response = requests.get(
                f'http://{subdomain}',
                timeout=10,
                allow_redirects=True
            )
            return response.status_code, response.text
        except requests.exceptions.RequestException as e:
            return 0, str(e)

def check_takeover(subdomain: str, cnames: List[str], response_body: str) -> Dict:
    """
    Check if subdomain is vulnerable to takeover

    Args:
        subdomain: Target subdomain
        cnames: List of CNAME records
        response_body: HTTP response body

    Returns:
        Dictionary with vulnerability details
    """
    for service, fingerprint in TAKEOVER_FINGERPRINTS.items():
        # Check if CNAME matches
        cname_match = any(
            any(pattern in cname for pattern in fingerprint['cname'])
            for cname in cnames
        )

        if cname_match:
            # Check for error fingerprints in response
            error_match = any(
                error.lower() in response_body.lower()
                for error in fingerprint['error']
            )

            if error_match:
                return {
                    'vulnerable': True,
                    'service': fingerprint['description'],
                    'cname': cnames[0] if cnames else 'N/A',
                    'confidence': 'High'
                }

    return {'vulnerable': False}

def scan_subdomain(subdomain: str) -> None:
    """
    Scan a single subdomain for takeover vulnerability

    Args:
        subdomain: Target subdomain to scan
    """
    print(f"\n{Colors.BLUE}[*] Scanning: {subdomain}{Colors.RESET}")

    # Get CNAME records
    cnames = get_cname(subdomain)

    if not cnames:
        print(f"{Colors.YELLOW}    [-] No CNAME found (A record or non-existent){Colors.RESET}")
        return

    print(f"{Colors.CYAN}    [+] CNAME: {', '.join(cnames)}{Colors.RESET}")

    # Check HTTP response
    status_code, response_body = check_http_response(subdomain)
    print(f"    [+] HTTP Status: {status_code}")

    # Check for takeover vulnerability
    result = check_takeover(subdomain, cnames, response_body)

    if result.get('vulnerable'):
        print(f"{Colors.RED}{Colors.BOLD}")
        print(f"    [!!!] POTENTIALLY VULNERABLE TO TAKEOVER")
        print(f"    [!!!] Service: {result['service']}")
        print(f"    [!!!] CNAME: {result['cname']}")
        print(f"    [!!!] Confidence: {result['confidence']}")
        print(f"{Colors.RESET}")
    else:
        print(f"{Colors.GREEN}    [✓] Not vulnerable{Colors.RESET}")

def main():
    """Main execution function"""
    banner()

    if len(sys.argv) < 2:
        print(f"{Colors.RED}Usage: python3 {sys.argv[0]} subdomain1 subdomain2 ...{Colors.RESET}")
        print(f"{Colors.YELLOW}Example: python3 {sys.argv[0]} old.example.com dev.example.com{Colors.RESET}")
        sys.exit(1)

    subdomains = sys.argv[1:]

    print(f"{Colors.BOLD}[*] Starting scan of {len(subdomains)} subdomain(s)...{Colors.RESET}")
    print(f"{Colors.YELLOW}[!] Warning: Disable SSL verification for testing only!{Colors.RESET}")

    # Scan each subdomain
    for subdomain in subdomains:
        scan_subdomain(subdomain.strip())

    print(f"\n{Colors.GREEN}{Colors.BOLD}[✓] Scan complete!{Colors.RESET}\n")

if __name__ == "__main__":
    # Suppress SSL warnings
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    main()
