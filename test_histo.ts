import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' }); // or .env.local

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing config");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Testing historico_ferramentas...");
  const { data, error } = await supabase.from('historico_ferramentas').select('*').limit(5);
  if (error) {
    console.error("Error fetching historico_ferramentas:", error);
  } else {
    console.log("Data:", data);
  }
}

run();
