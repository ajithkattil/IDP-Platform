package com.idp.service;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/")
    public ResponseEntity<Map<String, String>> root() {
        return ResponseEntity.ok(Map.of(
            "service", "${{ values.service_name }}",
            "status", "running",
            "owner", "${{ values.owner_team }}"
        ));
    }

    @GetMapping("/api/v1/info")
    public ResponseEntity<Map<String, String>> info() {
        return ResponseEntity.ok(Map.of(
            "service", "${{ values.service_name }}",
            "description", "${{ values.description }}",
            "owner", "${{ values.owner_team }}",
            "version", "1.0.0"
        ));
    }
}
