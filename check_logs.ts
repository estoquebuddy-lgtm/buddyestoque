import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking logs_atividades table structure...");
  const { data, error } = await supabase.from('logs_atividades').select('*').limit(1);
  if (error) {
    console.error("Error fetching logs_atividades:", error);
  } else if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
    console.log("Sample:", data[0]);
  } else {
    console.log("No data in logs_atividades, but table exists.");
  }
}

run();
