export type Role = "admin" | "tpo" | "recruiter" | "candidate";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  profile?: Record<string, unknown>;
}

export interface Drive {
  id: string;
  company_name: string;
  job_title: string;
  status: "draft" | "active" | "completed";
  drive_date?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  read: boolean;
  created_at: string;
}

