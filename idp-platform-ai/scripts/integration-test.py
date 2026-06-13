import requests, sys, time
BASE = "http://localhost:8000"
print("[test] Waiting for service...")
for i in range(12):
    try:
        if requests.get(f"{BASE}/api/v1/health", timeout=5).status_code == 200:
            print("[test] Service is up")
            break
    except Exception:
        pass
    print(f"  attempt {i+1}/12...")
    time.sleep(5)

passed = 0
failed = 0
def run(name, fn):
    global passed, failed
    try:
        fn()
        print(f"  PASS {name}")
        passed += 1
    except Exception as e:
        print(f"  FAIL {name}: {e}")
        failed += 1

run("GET /api/v1/health", lambda: setattr(type('',(),{}),'x',
    (lambda r: None if r.status_code==200 else exec("raise Exception(r.status_code)"))(
    requests.get(f"{BASE}/api/v1/health", timeout=10))))
run("GET /", lambda: setattr(type('',(),{}),'x',
    (lambda r: None if r.status_code==200 else exec("raise Exception(r.status_code)"))(
    requests.get(f"{BASE}/", timeout=10))))
run("GET /docs", lambda: setattr(type('',(),{}),'x',
    (lambda r: None if r.status_code==200 else exec("raise Exception(r.status_code)"))(
    requests.get(f"{BASE}/docs", timeout=10))))

print(f"\n[test] {passed} passed, {failed} failed")
sys.exit(1 if failed > 0 else 0)
