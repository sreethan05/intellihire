import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const router = Router();

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "IntelliHire API",
      version: "1.0.0",
      description: "Recruitment examination platform API documentation",
      contact: {
        name: "IntelliHire Support",
        email: "support@intellihire.com",
      },
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "recruiter", "tpo", "candidate"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Exam: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string" },
            duration: { type: "integer", description: "Duration in minutes" },
            total_marks: { type: "integer" },
            pass_marks: { type: "integer" },
            status: { type: "string", enum: ["draft", "published", "closed"] },
            created_by: { type: "string", format: "uuid" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            token: { type: "string" },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
  },
  apis: [
    "./src/routes/*.ts",
    "./server/src/routes/*.ts",
    "./dist/routes/*.js",
    "./server/dist/routes/*.js",
    "./src/routes/*.js",
    "./server/src/routes/*.js",
  ],
});

router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "IntelliHire API Docs",
}));

router.get("/json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

export default router;
