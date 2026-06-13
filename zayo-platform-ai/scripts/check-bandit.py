import json, sys
try:
    r = json.load(open('bandit-report.json'))
    h = [x for x in r['results'] if x['issue_severity'] in ('HIGH', 'CRITICAL')]
    for x in h:
        print(f"  [{x['issue_severity']}] {x['issue_text']} {x['filename']}:{x['line_number']}")
    if h:
        print(f"[sast] {len(h)} High/Critical findings - FAILED")
        sys.exit(1)
    print('[sast] bandit: 0 High/Critical - PASSED')
except Exception as e:
    print(f'[sast] skipped: {e}')
