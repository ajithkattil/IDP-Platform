import json, os, sys, requests

AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")

def load_findings():
    findings = []
    try:
        r = json.load(open("gitleaks-report.json"))
        items = r if isinstance(r, list) else r.get("results", [])
        for item in items:
            findings.append({
                "severity": "High",
                "rule": item.get("RuleID", "generic-api-key"),
                "file": item.get("File", "unknown"),
                "line": item.get("StartLine", 0),
                "description": f"Hardcoded secret: {item.get('Description', '')}",
                "cwe_id": "798",
            })
    except Exception:
        pass
    return findings

findings = load_findings()

if not findings:
    print("[sast-explain] No findings to explain")
    sys.exit(0)

print(f"\n[sast-explain] {len(findings)} finding(s) found")
for f in findings:
    print(f"  [{f['severity']}] {f['rule']} in {f['file']}:{f['line']}")

# Try AI explanation
try:
    resp = requests.post(
        f"{AI_SERVICE_URL}/api/v1/analyze/security",
        json={"service_name": "spring-orders-poc", "language": "java", "findings": findings},
        timeout=20,
    )
    if resp.status_code == 200:
        r = resp.json()
        print(f"\n[AI EXPLANATION]")
        print(f"  Summary: {r.get('plain_english_summary', '')}")
        print(f"  Top risk: {r.get('top_risk', '')}")
        print(f"  Fix time: {r.get('estimated_fix_time', '')}")
        for step in r.get("remediation_steps", []):
            print(f"  Step {step['step']}: {step['action']}")
    else:
        print(f"[sast-explain] AI service returned {resp.status_code}")
except Exception as e:
    print(f"[sast-explain] AI service unreachable: {e} — continuing without explanation")

# Gate: block on Critical/High
critical = [f for f in findings if f["severity"] in ("Critical", "High", "CRITICAL", "HIGH")]
if critical:
    print(f"\n[sast-explain] PIPELINE BLOCKED: {len(critical)} High/Critical finding(s)")
    print("Fix the issues above and push again.")
    sys.exit(1)
print("[sast-explain] No blocking findings")
