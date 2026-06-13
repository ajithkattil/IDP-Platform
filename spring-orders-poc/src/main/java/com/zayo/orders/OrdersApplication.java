package com.zayo.orders;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * spring-orders-poc — Zayo Order Processing Service
 * Demonstrates the Java golden pipeline end-to-end:
 *   GitLab SCM → CI/CD → Docker → ECR → EKS → Datadog DORA
 *
 * This service intentionally contains security vulnerabilities
 * that are caught by Checkmarx/Gitleaks in the CI pipeline.
 * The pipeline then calls zayo-platform-ai to explain them
 * in plain English — demonstrating the two-service POC story.
 */
@SpringBootApplication
public class OrdersApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrdersApplication.class, args);
    }
}
