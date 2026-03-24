import fs from 'fs';
const envStr = fs.readFileSync('.env', 'utf-8');
const urlMatch = envStr.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envStr.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

fetch(`${url}/rest/v1/importacoes_xml?select=*&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
})
.then(r => r.json())
.then(data => {
  console.log("DATA:");
  console.log(JSON.stringify(data[0] || {}, null, 2));
})
.catch(console.error);
