import dotenv from 'dotenv'
dotenv.config()

import { createClient } from "@supabase/supabase-js";


// Helper to enforce required env variables
function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

// Read env variables
const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseServiceKey);