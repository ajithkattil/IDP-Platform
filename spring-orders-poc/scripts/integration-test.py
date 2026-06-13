import requests, sys, time
BASE = "http://localhost:8080"
print("[test] Waiting for service...")
for i in range(12):
    try:
        if requests.get(f"{BASE}/api/v1/orders/health", timeout=5).status_code == 200:
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

def check_health():
    r = requests.get(f"{BASE}/actuator/health", timeout=10)
    assert r.status_code == 200

def check_orders():
    r = requests.get(f"{BASE}/api/v1/orders", timeout=10)
    assert r.status_code == 200
    assert "orders" in r.json()

run("GET /actuator/health", check_health)
run("GET /api/v1/orders", check_orders)
print(f"\n[test] {passed} passed, {failed} failed")
sys.exit(1 if failed > 0 else 0)
