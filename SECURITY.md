# Security Policy

## Reporting a Vulnerability

**Do not create a public GitHub issue for security vulnerabilities.**

Use GitHub's Private Vulnerability Reporting:
1. Go to the Security tab of this repository
2. Click "Report a vulnerability"
3. Fill in the details

### What to include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected version (if known)

---

## Response Timeline

| Step | Target |
|---|---|
| Initial acknowledgement | 48 hours |
| Status update | 7 days |
| Fix or mitigation | 90 days |

---

## Scope

### In Scope
- Application code in this repository
- API endpoints and authentication
- Data handling and storage
- Third-party dependencies with direct impact

### Out of Scope
- Third-party services we integrate with (report directly to them)
- Social engineering attacks
- Theoretical vulnerabilities without proof of concept

---

## Security Practices

This project uses an automated security review pipeline on every pull request including dependency audits and infrastructure-as-code review.

---

## Disclosure Policy

- We follow responsible disclosure (coordinated vulnerability disclosure)
- We will notify you when the fix is ready before public disclosure
- We will credit you in the release notes (unless you prefer to remain anonymous)
- We do not offer monetary rewards

---

## Supported Versions

Only the latest version receives security patches.
