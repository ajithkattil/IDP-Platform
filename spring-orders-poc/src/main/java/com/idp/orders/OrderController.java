package com.idp.orders;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Order REST controller.
 *
 * NOTE: This class intentionally contains two security issues
 * that the CI pipeline (Gitleaks + Checkmarx) will detect:
 *
 *   1. CWE-798: Hardcoded credential (DB_PASSWORD)
 *      → caught by Gitleaks at SAST stage
 *      → idp-platform-ai explains it in plain English
 *
 *   2. CWE-89: SQL injection in getOrderById()
 *      → caught by Checkmarx SAST
 *      → idp-platform-ai explains it and provides fix
 *
 * In the POC demo:
 *   - First push: pipeline blocks, AI explains both findings
 *   - Developer fixes both issues
 *   - Second push: pipeline goes green, service deploys
 */
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    // ── DELIBERATE VULNERABILITY 1: Hardcoded credential ──────
    // CWE-798 · caught by Gitleaks rule: generic-api-key
    // Fix: inject from Vault/Secrets Manager via @Value("${db.password}")
    private static final String DB_PASSWORD = "Sup3rS3cr3t!";

    // ── Mock data for demo ────────────────────────────────────
    private final List<Map<String, Object>> orders = new ArrayList<>(Arrays.asList(
        Map.of("id", "ORD-001", "customer", "Acme Corp",    "amount", 1250.00, "status", "shipped"),
        Map.of("id", "ORD-002", "customer", "Idp Internal","amount",  890.50, "status", "pending"),
        Map.of("id", "ORD-003", "customer", "TechCo Ltd",   "amount", 3400.00, "status", "delivered")
    ));

    @GetMapping
    public ResponseEntity<Map<String, Object>> listOrders() {
        log.info("GET /api/v1/orders count={}", orders.size());
        return ResponseEntity.ok(Map.of(
            "orders", orders,
            "total", orders.size(),
            "service", "spring-orders-poc"
        ));
    }

    // ── DELIBERATE VULNERABILITY 2: SQL Injection ─────────────
    // CWE-89 · caught by Checkmarx SAST rule: SQL_Injection
    // Fix: use JPA findById() or PreparedStatement with ? placeholders
    @GetMapping("/{id}")
    public ResponseEntity<Object> getOrderById(@PathVariable String id) {
        log.info("GET /api/v1/orders/{}", id);
        // VULNERABLE: user input directly concatenated into query string
        String query = "SELECT * FROM orders WHERE id = '" + id + "'";
        log.debug("Executing: {}", query);

        return orders.stream()
            .filter(o -> o.get("id").equals(id))
            .findFirst()
            .<ResponseEntity<Object>>map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody Map<String, Object> body) {
        String newId = "ORD-" + String.format("%03d", orders.size() + 1);
        Map<String, Object> order = new HashMap<>(body);
        order.put("id", newId);
        order.put("status", "pending");
        orders.add(order);
        log.info("Order created: {}", newId);
        return ResponseEntity.status(201).body(order);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "healthy",
            "service", "spring-orders-poc",
            "orders_count", orders.size()
        ));
    }
}
