import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('importacoes_xml').select('*').limit(1);
  if (data && data.length > 0) {
    console.log("Columns in importacoes_xml:", Object.keys(data[0]));
    console.log("Sample row:", data[0]);
  } else {
    console.log("No data or error:", error);
  }
}
check();
