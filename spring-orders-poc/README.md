# spring-orders-poc

**Language:** Java 17 / Spring Boot 3  
**Namespace:** orders  
**Port:** 8080  
**Image:** 123456789012.dkr.ecr.us-east-1.amazonaws.com/idp-poc/spring-orders-poc  
**GitLab:** gitlab.com/cltajith/spring-orders-poc

---

## What it does

The demo "customer" service that showcases the golden pipeline in action. It intentionally contains two security vulnerabilities that the pipeline catches and that Claude AI explains in plain English — this is the key demo moment.

### Intentional vulnerabilities (for demo purposes only)

| Vulnerability | Location | CWE | Detected by |
|--------------|----------|-----|-------------|
| Hardcoded DB password: `DB_PASSWORD = "Sup3rS3cr3t!"` | OrderController.java:47 | CWE-798 | Gitleaks |
| SQL injection: `"SELECT * FROM orders WHERE id = '" + orderId + "'"` | OrderController.java:68 | CWE-89 | Checkmarx |

---

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/orders` | GET | List all orders |
| `/api/v1/orders/{id}` | GET | Get order by ID |
| `/actuator/health` | GET | Spring Boot health check |
| `/actuator/health/liveness` | GET | Kubernetes liveness probe |
| `/actuator/health/readiness` | GET | Kubernetes readiness probe |

### Sample response — `/api/v1/orders`
```json
{
  "service": "spring-orders-poc",
  "orders": [
    {"id": "ORD-001", "customer": "Acme Corp", "amount": 1250.0, "status": "shipped"},
    {"id": "ORD-002", "customer": "Idp Internal", "amount": 890.5, "status": "pending"},
    {"id": "ORD-003", "customer": "TechCo Ltd", "amount": 3400.0, "status": "delivered"}
  ],
  "total": 3
}
```

---

## Local development

```bash
# Clone
git clone https://gitlab.com/cltajith/spring-orders-poc.git
cd spring-orders-poc

# Build and run
mvn spring-boot:run

# Test
curl http://localhost:8080/actuator/health
curl http://localhost:8080/api/v1/orders
```

---

## Project structure

```
spring-orders-poc/
├── src/
│   ├── main/java/com/idp/
│   │   ├── OrdersApplication.java      # Spring Boot entry point
│   │   ├── controller/
│   │   │   └── OrderController.java    # REST endpoints + intentional vulns
│   │   └── model/
│   │       └── Order.java              # Order data model
│   └── test/java/com/idp/
│       └── OrderControllerTest.java    # Unit tests
├── helm/
│   ├── Chart.yaml
│   └── values-prod.yaml                # EKS deployment config
├── scripts/
│   └── fire-datadog-event.py           # DORA event publisher
├── Dockerfile                          # Multi-stage Java build
├── pom.xml                             # Maven build config
├── .gitlab-ci.yml                      # Golden pipeline
└── catalog-info.yaml                   # Backstage service catalog entry
```

---

## CI/CD pipeline stages

| Stage | Jobs | Runs when |
|-------|------|-----------|
| lint | Checkstyle | Every push |
| sast | sast-checkmarx (skipped), sast-gitleaks, sast-explain | Every push |
| test | Maven unit tests | Every push |
| build | Docker build | main branch only |
| push | ECR push | main branch only |
| notify | Datadog DORA event | main branch only |

### The sast-explain stage (key demo moment)

The `sast-explain` job calls `idp-platform-ai` with the SAST findings and logs Claude's explanation directly in the pipeline output:

```
[AI EXPLANATION]
============================================================
Two security issues were found in your code:

1. CWE-798 Hardcoded Credential (HIGH)
   DB_PASSWORD = "Sup3rS3cr3t!" in OrderController.java:47
   Fix: Move to environment variable or AWS Secrets Manager
   Estimated fix time: 15 minutes

2. CWE-89 SQL Injection (CRITICAL)
   String concatenation in SQL query at OrderController.java:68
   Fix: Use PreparedStatement with parameterised queries
   Estimated fix time: 30 minutes
============================================================
```

---

## Kubernetes deployment

```bash
# Check pods
kubectl get pods -n orders

# View logs
kubectl logs -n orders -l app=spring-orders-poc --tail=50

# Port forward for local access
kubectl port-forward svc/spring-orders-poc 8080:8080 -n orders

# Restart deployment
kubectl rollout restart deployment/spring-orders-poc -n orders
```

---

## ECR image pull secret

The orders namespace needs an ECR pull secret:

```bash
kubectl create secret docker-registry ecr-pull-secret \
  -n orders \
  --docker-server=123456789012.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password --region us-east-1)

kubectl patch deployment spring-orders-poc -n orders \
  -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"ecr-pull-secret"}]}}}}'
```

---

## Helm values (key settings)

```yaml
replicaCount: 1          # Reduced from 2 due to cluster resource constraints
image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/idp-poc/spring-orders-poc
  tag: "v1.0.0-654d1689"
livenessProbe:
  initialDelaySeconds: 45   # Spring Boot needs time to start
readinessProbe:
  initialDelaySeconds: 30
```
