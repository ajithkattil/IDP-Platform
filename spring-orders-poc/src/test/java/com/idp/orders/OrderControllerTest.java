package com.idp.orders;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    MockMvc mvc;

    @Test
    void listOrders_returns200() throws Exception {
        mvc.perform(get("/api/v1/orders"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.service").value("spring-orders-poc"))
           .andExpect(jsonPath("$.total").value(greaterThan(0)));
    }

    @Test
    void getOrder_knownId_returns200() throws Exception {
        mvc.perform(get("/api/v1/orders/ORD-001"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.id").value("ORD-001"));
    }

    @Test
    void getOrder_unknownId_returns404() throws Exception {
        mvc.perform(get("/api/v1/orders/UNKNOWN"))
           .andExpect(status().isNotFound());
    }

    @Test
    void health_returns200() throws Exception {
        mvc.perform(get("/api/v1/orders/health"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value("healthy"));
    }

    @Test
    void createOrder_returns201() throws Exception {
        String body = "{\"customer\":\"Test Corp\",\"amount\":500.0}";
        mvc.perform(post("/api/v1/orders")
            .contentType("application/json")
            .content(body))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.id").exists())
           .andExpect(jsonPath("$.status").value("pending"));
    }
}
