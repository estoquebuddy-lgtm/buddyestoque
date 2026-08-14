import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Checking if table 'fornecedores' exists...");
  const { data, error } = await supabase
    .from('fornecedores')
    .select('*')
    .limit(1);

  if (error) {
    console.log("Error querying 'fornecedores':", error.message);
    console.log("This probably means the table DOES NOT exist.");
  } else {
    console.log("Success querying 'fornecedores'!");
    console.log("Existing columns:", data && data.length > 0 ? Object.keys(data[0]) : "Table exists but is empty");
  }
}

check();
