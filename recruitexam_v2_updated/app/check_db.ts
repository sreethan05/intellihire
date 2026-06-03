import axios from "axios";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "./.env") });

async function checkRPC() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  try {
    const response = await axios.get(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    const paths = Object.keys(response.data.paths || {});
    const rpcs = paths.filter(p => p.startsWith("/rpc/"));
    console.log("Available RPC endpoints:", rpcs);
  } catch (err: any) {
    console.error("Error fetching Swagger spec:", err.message);
  }
}

checkRPC();
