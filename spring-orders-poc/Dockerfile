# ============================================================
# spring-orders-poc — Dockerfile
# Multi-stage: Maven build → minimal JRE runtime
# Datadog dd-java-agent baked in
# ============================================================

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q --no-transfer-progress
COPY src ./src
RUN mvn package -DskipTests --no-transfer-progress -q

FROM eclipse-temurin:17-jre-jammy AS runtime
LABEL com.idp.service="spring-orders-poc"
LABEL com.idp.team="orders-team"

RUN groupadd --system appgroup && useradd --system --gid appgroup appuser
WORKDIR /app
RUN chown appuser:appgroup /app

# Datadog Java agent — baked in, not added at runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ADD https://dtdg.co/latest-java-tracer /app/dd-java-agent.jar
RUN chmod 444 /app/dd-java-agent.jar

COPY --from=build /build/target/*.jar /app/app.jar
RUN chmod 444 /app/app.jar

USER appuser

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:8080/actuator/health || exit 1

EXPOSE 8080

# DD_* env vars injected by Helm values at deploy time
CMD ["java", "-javaagent:/app/dd-java-agent.jar", \
     "-Ddd.logs.injection=true", \
     "-jar", "/app/app.jar"]
