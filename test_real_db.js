const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Checking database...");
  console.log("URL:", supabaseUrl);

  const { data, error } = await supabase
    .from('compras')
    .select('*, compras_nfs_vinculos(compras_nfs(*)), entradas(*, produtos(*))')
    .limit(1);

  if (error) {
    console.error("❌ Test query failed:", error);
  } else {
    console.log("✅ Test query succeeded. Returned:", data);
  }

  const { data: vData, error: vError } = await supabase
    .from('compras_nfs_vinculos')
    .select('*')
    .limit(1);

  if (vError) {
    console.error("❌ Querying compras_nfs_vinculos directly failed:", vError);
  } else {
    console.log("✅ Querying compras_nfs_vinculos directly succeeded. Returned:", vData);
  }
}

test();
